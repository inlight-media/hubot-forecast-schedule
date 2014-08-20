// Description
//   Announce Forecast schedules for people and projects.
//
// Dependencies:
//   "async": "^0.9.0"
//   "forecast-api": "0.0.1"
//   "moment": "^2.8.1"
//   "moment-range": "^1.0.2"
//   "underscore": "^1.6.0"
//
// Configuration:
//   FORECAST_ACCOUNT_ID
//   FORECAST_AUTHORIZATION
//
// Commands:
//   hubot show forecast projects
//   hubot show forecast people
//   hubot show [x day] (schedule|forecast)
//   hubot show [x day] (schedule|forecast) [for person name]
//   hubot show [x day] (schedule|forecast) [for project name]
//
// Notes:
//   Requires a http://forecastapp.com account.
//
// Author:
//   tonymilne

var _ = require('underscore');
var async = require('async');
var moment = require('moment');
require('moment-range');

var Forecast = require('forecast-api');
var forecast = new Forecast({
	accountId: process.env.FORECAST_ACCOUNT_ID,
	authorization: process.env.FORECAST_AUTHORIZATION
});

module.exports = function(robot) {
	robot.respond(/show forecast people/, function(msg) {
		people(function(err, lines) {
			if (err) {
				return msg.send(err);
			}
			_.map(lines, msg.send);
		});
	});

	robot.respond(/show forecast projects/, function(msg) {
		projects(function(err, lines) {
			if (err) {
				return msg.send(err);
			}
			_.map(lines, msg.send);
		});
	});

	/**
	 * show 5 day schedule for Person
	 * show schedule for Person Fullname
	 * show schedule
	 * show 2 day schedule
	 * show 2 day schedule for Example Project
	 * show schedule for Example Project
	 */
	robot.respond(/show ((\d+) day |)(schedule|forecast)(| for (.*))$/, function(msg) {
		var days = msg.match[2] ? parseInt(msg.match[2], 10) : 1;
		var term = msg.match[5] || '';

		var options = {
			startDate: moment(),
			endDate: moment().add(days, 'days')
		}

		schedule(term, options, function(err, lines) {
			if (err) {
				return msg.send(err);
			}
			_.map(lines, msg.send);
		});
	});
};

function people(callback) {
	forecast.people(function(err, people) {
		if (err) {
			return callback(err);
		}

		var lines = [];
		lines.push('Listing people in Forecast:');
		people.forEach(function(person) {
			if (!person.archived) {
				lines.push('\t' + person.first_name + ' ' + person.last_name);
			}
		});
		callback(null, lines);
	});
}

function projects(callback) {
	forecast.projects(function(err, projects) {
		if (err) {
			return callback(err);
		}

		var lines = [];
		lines.push('Listing projects in Forecast:');
		projects.forEach(function(project) {
			if (!project.archived) {
				lines.push(project.name);
			}
		});
		callback(null, lines);
	});
}

/**
 * Schedule.
 * If term is empty, returns schedule for everything.
 * If term is a person, returns the person's schedule.
 * If term is a project, returns the project's schedule.
 */
function schedule(term, options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	getForecastData(options, function(err, data) {
		if (err) {
			return callback(err);
		}

		if (term.length === 0) {
			prepareReport(data, options, callback)
		}
		else {
			getPersonOrProject(term, data, function(err, obj) {
				if (err) {
					return callback(err);
				}

				if (obj.type === 'person') {
					scheduleForPerson(obj.value, data, options, callback);
				}
				else if (obj.type === 'project') {
					scheduleForProject(obj.value, data, options, callback);
				}
			});
		}
	});
}

function getPersonOrProject(term, data, callback) {
	var lowerCaseTerm = (term || '').toLowerCase();
	var value;

	// Check each of the projects first; return early if we find one.
	value = _.find(data.projects, function(project) {
		return (project.name.toLowerCase() === lowerCaseTerm);
	});
	if (value) {
		return callback(null, { type: 'project', value: value });
	}

	// Check each of the people; return early if we find one.
	// People are matched via first name only, or first name + last name.
	value = _.find(data.people, function(person) {
		if (person.first_name.toLowerCase() === lowerCaseTerm) {
			return true;
		}
		else if ((person.first_name + ' ' + person.last_name).toLowerCase() === lowerCaseTerm) {
			return true;
		}
		return false;
	});
	if (value) {
		return callback(null, { type: 'person', value: value });
	}

	// We still don't have a value; return an error.
	callback(new Error('Unknown person/project matching term: ' + term));
}

function scheduleForPerson(person, data, options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}
	options.title = 'Schedule for ' + person.first_name + ' ' + person.last_name + ':';

	// Reduce assignments to just this person's.
	data.assignments = _.where(data.assignments, { person_id: person.id });
	data.milestones = null;

	prepareReport(data, options, callback);
}

function scheduleForProject(project, data, options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}
	options.title = 'Schedule for ' + project.name + ':';

	// Reduce assignments and milestones to just this project's.
	data.assignments = _.where(data.assignments, { project_id: project.id });
	data.milestones = _.where(data.milestones, { project_id: project.id });

	prepareReport(data, options, callback);
}

function prepareReport(data, options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	// Becomes a hash of dates - people/milestones.
	var dates = {
		// 2014-01-01: person_id: { project_id, allocation }
		// 2014-01-01: milestone: { project_id, name }
	};

	var title = options.title || 'Schedule:';
	var startDate = options.startDate || moment();
	var endDate = options.endDate || moment().add(1, 'days');
	var scheduleRange = moment().range(startDate, endDate);

	var assignments = data.assignments || [];
	var milestones = data.milestones || [];

	// @NOTE: Because assignments can start/end well outside the current
	// schedule range; we can ignore them if they aren't within range.
	// We also ignore weekends using isoWeekday -- Saturday:6 and Sunday:7.

	assignments.forEach(function(assignment) {
		var assignmentRange = moment.range(moment(assignment.start_date), moment(assignment.end_date));
		assignmentRange.by('days', function(date) {
			if (date.within(scheduleRange) && date.isoWeekday() < 6) {
				var day = date.format('YYYY-MM-DD');
				if (typeof dates[day] === 'undefined') {
					dates[day] = {};
				}
				if (typeof dates[day][assignment.person_id] === 'undefined') {
					dates[day][assignment.person_id] = [];
				}
				dates[day][assignment.person_id].push({
					project_id: assignment.project_id,
					project: data.projectsById[assignment.project_id],
					allocation: assignment.allocation,
					notes: assignment.notes,
				});
			}
		});
	});

	milestones.forEach(function(milestone) {
		var date = moment(milestone.date);
		if (date.within(scheduleRange) && date.isoWeekday() < 6) {
			var day = milestone.date;
			if (typeof dates[day] === 'undefined') {
				dates[day] = {};
			}
			if (typeof dates[day]['milestone'] === 'undefined') {
				dates[day]['milestone'] = [];
			}
			dates[day]['milestone'].push({
				project_id: milestone.project_id,
				project: data.projectsById[milestone.project_id],
				name: milestone.name,
			});
		}
	});

	var lines = [];
	lines.push(title);
	_.each(dates, function(obj, day) {
		lines.push('\t' + moment(day).format('ddd Do MMM') + ':');
		if (typeof obj.milestone !== 'undefined') {
			lines.push('\t\tMILESTONES:');
			obj.milestone.forEach(function(milestone) {
				lines.push('\t\t\t' + milestone.name + ' - ' + milestone.project.name);
			});
			delete obj.milestone;
		}

		_.keys(obj).forEach(function(key) {
			var personId = key;
			var person = data.peopleById[personId];
			lines.push('\t\t' + person.first_name + ' ' + person.last_name[0] + ':');
			obj[key].forEach(function(assignment) {
				lines.push('\t\t\t' + assignment.allocation + ' hours - ' + assignment.project.name);
			});
		});
	});

	callback(null, lines);
}

function getForecastData(options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};
	}

	// Set options if they are undefined.
	if (!options.startDate) {
		startDate = moment();
	}
	if (!options.endDate) {
		endDate = moment().add(1, 'days');
	}

	async.parallel([
		function(done) {
			forecast.projects(done);
		},
		function(done) {
			forecast.people(done);
		},
		function(done) {
			forecast.assignments(options, done);
		},
		function(done) {
			forecast.milestones(options, done);
		}
	], function(err, results) {
		if (err) {
			return callback(err);
		}

		var obj = {
			projects: results[0],
			people: results[1],
			assignments: results[2],
			milestones: results[3]
		};

		obj.projectsById = _.indexBy(obj.projects, 'id');
		obj.peopleById = _.indexBy(obj.people, 'id');
		obj.assignmentsById = _.indexBy(obj.assignments, 'id');
		obj.milestonesById = _.indexBy(obj.milestones, 'id');

		callback(null, obj);
	});
}
