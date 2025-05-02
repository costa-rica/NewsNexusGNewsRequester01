const {
  Article,
  NewsApiRequest,
  EntityWhoFoundArticle,
  NewsArticleAggregatorSource,
} = require("newsnexus07db");
const {
  writeResponseDataFromNewsAggregator,
} = require("./utilitiesReadAndMakeFiles");
const { checkRequestAndModifyDates } = require("./utilitiesMisc");

async function requester(requestParametersObject) {
  // Step 1: prepare paramters
  const requestWindowInDays = 10; // how many days from startDate to endDate
  const andString = requestParametersObject.andString;
  const orString = requestParametersObject.orString;
  const notString = requestParametersObject.notString;
  const dateStartOfRequest = requestParametersObject.dateStartOfRequest;
  // console.log(
  //   `dateStartOfRequest: ${dateStartOfRequest}, type: ${typeof dateStartOfRequest}`
  // );

  const dateEndOfRequest = new Date(
    new Date().setDate(
      new Date(dateStartOfRequest).getDate() + requestWindowInDays
    )
  )
    .toISOString()
    .split("T")[0];

  const gNewsSourceObj = await NewsArticleAggregatorSource.findOne({
    where: { nameOfOrg: "GNews" },
    raw: true, // Returns data without all the database gibberish
  });

  // Step 2: Modify the startDate and endDate if necessary
  const { adjustedStartDate, adjustedEndDate } =
    await checkRequestAndModifyDates(
      andString,
      orString,
      notString,
      dateStartOfRequest,
      dateEndOfRequest,
      gNewsSourceObj,
      requestWindowInDays
    );
  console.log(
    `-> query object id: ${requestParametersObject.id}, startDate: ${adjustedStartDate} - ${adjustedEndDate}: ${requestParametersObject.andString}`
  );

  // Step 3: make the request
  let requestResponseData = null;
  let newsApiRequestObj = null;

  if (adjustedStartDate === adjustedEndDate) {
    console.log(`No request needed for ${requestParametersObject.andString}`);
    return adjustedEndDate;
  }

  try {
    ({ requestResponseData, newsApiRequestObj } =
      await makeGNewsApiRequestDetailed(
        gNewsSourceObj,
        adjustedStartDate,
        adjustedEndDate,
        andString,
        orString,
        notString
      ));
  } catch (error) {
    console.error("Error during GNews API request:", error);
    return; // prevent proceeding to storeGNewsArticles if request failed
  }

  // Step 4: store the articles
  if (!requestResponseData?.articles) {
    console.log("No articles received from GNews API");
  } else {
    // Store articles and update NewsApiRequest
    await storeGNewsArticles(requestResponseData, newsApiRequestObj);
    console.log(`completed NewsApiRequest.id: ${newsApiRequestObj.id}`);
  }

  console.log(`requester finished for: ${requestParametersObject.andString}`);

  return adjustedEndDate;
}

async function makeGNewsApiRequestDetailed(
  sourceObj,
  startDate,
  endDate,
  andString,
  orString,
  notString
) {
  function splitPreservingQuotes(str) {
    return str.match(/"[^"]+"|\S+/g)?.map((s) => s.trim()) || [];
  }

  const andArray = splitPreservingQuotes(andString ? andString : "");
  const orArray = splitPreservingQuotes(orString ? orString : "");
  const notArray = splitPreservingQuotes(notString ? notString : "");

  // Step 1: prepare token and dates
  if (!endDate) {
    console.log(" !!! no endDate !!!");
    endDate = new Date().toISOString().split("T")[0];
  }
  if (!startDate) {
    console.log(" !!! no startDate !!!");
    // startDate should be 90 days prior to endDate - account limitation
    startDate = new Date(new Date().setDate(new Date().getDate() - 90))
      .toISOString()
      .split("T")[0];
  }

  let queryParams = [];

  const andPart = andArray.length > 0 ? andArray.join(" AND ") : "";
  const orPart = orArray.length > 0 ? `(${orArray.join(" OR ")})` : "";
  const notPart =
    notArray.length > 0 ? notArray.map((k) => `NOT ${k}`).join(" AND ") : "";

  const fullQuery = [andPart, orPart, notPart].filter(Boolean).join(" AND ");
  // console.log(`fullQuery: ${fullQuery}`);
  if (fullQuery) {
    queryParams.push(`q=${encodeURIComponent(fullQuery)}`);
  }

  if (startDate) {
    const formattedStartDate = new Date(startDate)
      .toISOString()
      .replace(".000", "");
    queryParams.push(`from=${formattedStartDate}`);
  }

  if (endDate) {
    const formattedEndDate = new Date(endDate)
      .toISOString()
      .replace(".000", "");
    queryParams.push(`to=${formattedEndDate}`);
  }
  queryParams.push(`max=100`);

  // Always required
  queryParams.push("lang=en");
  queryParams.push("country=us");
  queryParams.push(`apikey=${sourceObj.apiKey}`);

  const requestUrl = `${sourceObj.url}search?${queryParams.join("&")}`;

  let status = "success";
  let requestResponseData = null;
  let newsApiRequestObj = null;
  if (process.env.ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES === "true") {
    const response = await fetch(requestUrl);
    // console.log(`response_statue: ${response.status}`);
    requestResponseData = await response.json();

    if (!requestResponseData?.articles) {
      status = "error";
      console.log(`🚧 Here is the error 🚧`);
      writeResponseDataFromNewsAggregator(
        sourceObj.id,
        { id: "failed", url: requestUrl },
        requestResponseData,
        true
      );
      return { requestResponseData, newsApiRequestObj };
    }

    // Step 4: create new NewsApiRequest
    newsApiRequestObj = await NewsApiRequest.create({
      newsArticleAggregatorSourceId: sourceObj.id,
      dateStartOfRequest: startDate,
      dateEndOfRequest: endDate,
      countOfArticlesReceivedFromRequest: requestResponseData.articles?.length,
      countOfArticlesAvailableFromRequest: requestResponseData?.totalArticles,
      status,
      url: requestUrl,
      andString: andString,
      orString: orString,
      notString: notString,
      isFromAutomation: true,
    });
  } else {
    newsApiRequestObj = requestUrl;
  }

  return { requestResponseData, newsApiRequestObj };
}

// Store the articles of a single request in Aritcle and update NewsApiRequest
async function storeGNewsArticles(requestResponseData, newsApiRequestObj) {
  // leverages the hasOne association from the NewsArticleAggregatorSource model
  const gNewsSource = await NewsArticleAggregatorSource.findOne({
    where: { nameOfOrg: "GNews" },
    include: [{ model: EntityWhoFoundArticle }],
  });

  const entityWhoFoundArticleId = gNewsSource.EntityWhoFoundArticle?.id;
  try {
    let countOfArticlesSavedToDbFromRequest = 0;
    for (let article of requestResponseData.articles) {
      const existingArticle = await Article.findOne({
        where: { url: article.url },
      });
      if (existingArticle) {
        continue;
      }

      await Article.create({
        publicationName: article.source.name,
        title: article.title,
        description: article.description,
        url: article.url,
        urlToImage: article.image,
        publishedDate: article.publishedAt,
        entityWhoFoundArticleId: entityWhoFoundArticleId,
        newsApiRequestId: newsApiRequestObj.id,
      });
      countOfArticlesSavedToDbFromRequest++;
    }
    // Append NewsApiRequest
    await newsApiRequestObj.update({
      countOfArticlesSavedToDbFromRequest: countOfArticlesSavedToDbFromRequest,
    });

    writeResponseDataFromNewsAggregator(
      gNewsSource.id,
      newsApiRequestObj,
      requestResponseData,
      false
    );
  } catch (error) {
    console.error(error);

    writeResponseDataFromNewsAggregator(
      gNewsSource.id,
      newsApiRequestObj,
      requestResponseData,
      true
    );
  }
}

module.exports = {
  storeGNewsArticles,
  makeGNewsApiRequestDetailed,
  requester,
};
