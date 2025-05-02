const {
  NewsApiRequest,
  NewsArticleAggregatorSource,
} = require("newsnexus07db");

async function createArraysOfParametersNeverRequestedAndRequested(
  queryObjects
) {
  let arrayOfParametersNeverRequested = [];
  let arrayOfParametersRequested = [];
  // Load all existing requests from DB (we only need these 3 fields)
  const existingRequests = await NewsApiRequest.findAll({
    attributes: ["andString", "orString", "notString", "dateEndOfRequest"],
    raw: true,
    order: [["dateEndOfRequest", "DESC"]],
  });

  for (const queryObj of queryObjects) {
    // console.log(queryObj);
    const alreadyRequested = existingRequests.find((req) => {
      return (
        req.andString === queryObj.andString &&
        req.orString === queryObj.orString &&
        req.notString === queryObj.notString
      );
    });

    if (alreadyRequested) {
      arrayOfParametersRequested.push({
        ...queryObj,
        dateEndOfRequest: alreadyRequested.dateEndOfRequest,
      });
    } else {
      arrayOfParametersNeverRequested.push(queryObj);
    }
  }

  // -----> TODO: Remove any requests where dateEndOfRequest is equal to today
  arrayOfParametersRequested = arrayOfParametersRequested.filter((req) => {
    return req.dateEndOfRequest !== new Date().toISOString().split("T")[0];
  });

  return { arrayOfParametersNeverRequested, arrayOfParametersRequested };
}

async function checkRequestAndModifyDates(
  andString,
  orString,
  notString,
  startDate,
  endDate,
  gNewsSourceObj,
  requestWindowInDays
) {
  const existingRequests = await NewsApiRequest.findAll({
    where: {
      andString: andString,
      orString: orString,
      notString: notString,
      newsArticleAggregatorSourceId: gNewsSourceObj.id,
    },
    order: [["dateEndOfRequest", "DESC"]],
    limit: 1,
  });

  if (existingRequests.length > 0) {
    const latestEndDate = existingRequests[0].dateEndOfRequest;
    const newStartDate = latestEndDate;
    let newEndDate = new Date(
      new Date(newStartDate).getTime() +
        requestWindowInDays * 24 * 60 * 60 * 1000
    );

    const today = new Date();
    if (newEndDate > today) {
      newEndDate = today;
    }

    newEndDate = newEndDate.toISOString().split("T")[0];

    return { adjustedStartDate: newStartDate, adjustedEndDate: newEndDate };
  } else {
    const today = new Date();
    const endDateDateObj = new Date(endDate);
    if (endDateDateObj > today) {
      endDate = today.toISOString().split("T")[0];
    }
    return { adjustedStartDate: startDate, adjustedEndDate: endDate };
  }
}

async function findEndDateToQueryParameters(queryParameters) {
  const gNewsSourceObj = await NewsArticleAggregatorSource.findOne({
    where: { nameOfOrg: "GNews" },
    raw: true, // Returns data without all the database gibberish
  });
  const existingRequests = await NewsApiRequest.findAll({
    where: {
      andString: queryParameters.andString,
      orString: queryParameters.orString,
      notString: queryParameters.notString,
      newsArticleAggregatorSourceId: gNewsSourceObj.id,
    },
    order: [["dateEndOfRequest", "DESC"]],
    limit: 1,
  });

  if (existingRequests.length > 0) {
    const latestEndDate = existingRequests[0].dateEndOfRequest;
    return latestEndDate;
  } else {
    const day180daysAgo = new Date(
      new Date().setDate(new Date().getDate() - 180)
    )
      .toISOString()
      .split("T")[0];
    // console.log(
    //   `day180daysAgo: ${day180daysAgo}, type: ${typeof day180daysAgo}`
    // );

    return day180daysAgo;
  }
}

module.exports = {
  createArraysOfParametersNeverRequestedAndRequested,
  checkRequestAndModifyDates,
  findEndDateToQueryParameters,
};
