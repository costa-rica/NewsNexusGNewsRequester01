# NewsNexusGNewsRequester01 - OBE

This application is no longer in use. It has been replaced by the [NewsNexusRequesterGNews02](https://github.com/costa-rica/NewsNexusRequesterGNews02) microservice.

## Overview

The GNews requester process is broken into two main parts:

### 1. Creating Prioritized Request Parameter Array

The app reads search parameter combinations from an Excel spreadsheet located at the path defined by the `PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED` environment variable. Each parameter object contains `andString`, `orString`, and `notString` fields.

These parameter objects are then prioritized using the following logic:

- Parameters that have **never been requested** before (i.e. no matching entry in the `NewsApiRequests` table) are placed **first**.
- Parameters that have been requested previously are then sorted in **ascending order of their `dateEndOfRequest`**, so older requests are retried first.

### 2. Making GNews API Requests

Once the prioritized array is constructed, the application:

- Iterates through the request parameter array.
- Makes a GNews API request for each item.
- Updates the `NewsApiRequests` table with the results, including the `dateEndOfRequest`, ensuring accurate tracking of each parameter's request history.

This methodical approach ensures comprehensive and prioritized coverage of query terms, avoiding redundant or excessive API usage.

## Requirements

This app requires importing or adding the `newsnexus07db` package, which provides the Sequelize setup and model definitions needed to read and write to the `NewsApiRequests` table.

## Environment Variables

- `PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED`: Path to the Excel file containing the query parameters.
- Need database connection variables as well for the NewsNexus07Db package.

### Example of necessary environment variables

```env
APP_NAME=NewsNexusGNewsRequester01
NAME_DB=newsnexus07.db
ACTIVATE_API_REQUESTS_TO_OUTSIDE_SOURCES=true
PATH_AND_FILENAME_FOR_QUERY_SPREADSHEET_AUTOMATED=/Users/nick/Documents/_project_resources/NewsNexus07/utilities/GNewsRequestsAutomated.xlsx
PATH_TO_API_RESPONSE_JSON_FILES=/Users/nick/Documents/_project_resources/NewsNexus07/api_response_json_files
NAME_OF_ORG_REQUESTING_FROM=GNews
LIMIT_MASTER_INDEX_OF_WHILE_TRUE_LOOP=100000
MILISECONDS_IN_BETWEEN_REQUESTS=1100
```

## Excel spreadsheet

- columns needed: id, andString, orString, notString, startDate
- no endDate column needed, this is calculated in the app
