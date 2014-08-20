# Hubot Forecast schedule script

A hubot script for [Forecast](http://forecastapp.com).

## Installation

As an external script, via npm:

```bash
$ npm install hubot-forecast-schedule
```
Don't forget to update your external-scripts.json accordingly.

Alternatively, you can just copy the scripts/forecast-schedule.js file into your scripts directory.

Ensure you've updated your hubot package.json file and included this script's dependencies. They are listed in the package.json file.

### Env variables

- FORECAST_ACCOUNT_ID
- FORECAST_AUTHORIZATION

You can find your accountId and authorization token by inspecting any of the Forecast headers. View the [forecast-api module](http://github.com/inlight-media/node-forecast-api) for more info.

## Commands

```
hubot show forecast projects
hubot show forecast people
hubot show [x day] (schedule|forecast)
hubot show [x day] (schedule|forecast) [for person name]
hubot show [x day] (schedule|forecast) [for project name]

E.g. hubot show forecast projects
E.g. hubot show 3 day schedule for Tony
E.g. hubot show forecast for Project X
```
