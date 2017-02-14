'use strict'

const config = require('../lib/config')

const command = 'target <jiraHost>'
const describe = 'Targets partical JIRA instance and Trello board for further queries'
const builder = function (yargs) {

  const HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE

  return yargs
    .usage(`usage: $0 target <jiraHost> [options]

  Targets JIRA in particular location <jiraHost> together and Trello`)
    .option('trello-key', {
      describe: 'Trello API key',
      demand: true
    })
    .option('trello-token', {
      describe: 'Trello token',
      demand: true
    })
    .option('jira-user', {
      describe: 'JIRA username',
      demand: true
    })
    .option('jira-password', {
      describe: 'JIRA password',
      demand: true
    })
    .demand(1)
    .help('help')
    .wrap(null)
}

const handler = function(argv) {

  const configuration = {
    jira: {
      host: argv.jiraHost,
      username: argv.jiraUser,
      password: argv.jiraPassword
    },
    trello: {
      key: argv.trelloKey,
      token: argv.trelloToken
    }
  }

  config.updateConfiguration(configuration)
    .then(configFile => {
      console.log(`Trira configuration stored in ${configFile}`)
    })
    .catch(err => {
      console.error(`Failed to update Trira configuration, ${err}`)
      process.exit(1)
    })
}

module.exports = {command, describe, builder, handler}
