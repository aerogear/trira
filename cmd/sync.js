'use strict'

const prettyjson = require('prettyjson')
const objectPath = require('object-path')
const stripIndent = require('common-tags').stripIndent
const util = require('util')
const trelloCards = require('../lib/trello')
const jira = require('../lib/jira')
const config = require('../lib/config')
const logger = require('../lib/logger')

const command = 'sync <board-regexp> <epic>'
const describe = 'Sync Trello Board with particular Epic in JIRA'
const builder = function (yargs) {

  const HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE

  return yargs
    .usage(`usage: $0 sync <board-regexp> <epic> [options]

  Syncs cards in a Trello Board <board-regexp> (case insensitive) with JIRA Epic <epic>`)
    .option('dry-run', {
      describe: 'Do not push anything to JIRA',
      default: false
    })
    .option('list-regexp', {
      describe: 'Lists to be fetched. Case insensitive.',
      default: 'MUST PER (RELEASE|BUILD)',
      defaultDescription: 'MUST PER RELEASE and MUST PER BUILD lists to be fetched from boards',
      type: 'array'
    })
    .option('card-regexp', {
      describe: 'Cards name regular expression to be fetched. Case insensitive',
      default: '.*',
      defaultDescription: 'Fetch all cards by default'
    })
    .option('add-labels', {
      describe: 'Comma separated list of labels to be added to JIRA issues',
      default: undefined
    })
    .demand(2)
    .help('help')
    .wrap(null)
}

const transformToJiraFormat = function (parentEpic, epicField, storyPointField, card) {

  const issue = {
    fields: {
      issuetype: {
        name: 'Task'
      },
      project: {
        id: parentEpic.fields.project.id
      },
      summary: card.summary,
      description: `${card.description}\n[Trello link|${card.cardLink}]`,
      fixVersions: parentEpic.fields.fixVersions ? parentEpic.fields.fixVersions.map(fv => {
        return {
          id: fv.id
        }
      }) : [],
      labels: card.labels,
      // epic link
      [epicField.id]: parentEpic.key
    }
  }

  // add all checklists to description
  issue.fields.description += Object.keys(card.details).reduce((details, listName) => {
        return `${details}\nh3. ${listName}\n${card.details[listName].map((value, index) => `${index+1}. ${value}`).join(`\n`)}`
      }, '')

  if(storyPointField && card.storyPoints) {
    issue.fields[storyPointField.id] = parseFloat(card.storyPoints)
  }


  return issue
}

const pushCardsToJira = function (cards, epic, jiraConfig) {

  return jira(jiraConfig)
    .then(jira => {
      logger.debug('Connected to JIRA')
      return Promise.all([Promise.resolve(jira), jira.listFields(), jira.findIssue(epic)])
    }).then(([jira, fields, epic]) => {

      const epicField = fields.find(f => {
        // 'com.pyxis.greenhopper.jira:gh-epic-link',
        return objectPath.get(f, 'schema.custom', '').match(/gh-epic-link/i) !== null
      })

      const storyPointsField = fields.find(f => {
        return objectPath.get(f, 'name', '').match('/story point/i') !== null
      })

      if(!epicField) {
        return Promise.reject('JIRA does not support Greenhopper Epic field')
      }

      if(epic.fields.issuetype.name !== 'Epic') {
        return Promise.reject(`Issue ${epic.key} is not an epic in JIRA`)
      }
      logger.debug(`JIRA instance has Epic support and epic has been provided`)
      return Promise.all([Promise.resolve(jira), Promise.resolve(epic), Promise.resolve(epicField), Promise.resolve(storyPointsField)])
    })
    .then(([jira, parentEpic, epicField, storyPointsField]) => {

      const newIssues = []
      cards.forEach(card => {
        newIssues.push(jira.addNewIssue(transformToJiraFormat(parentEpic, epicField, storyPointsField, card)))
      })

      return Promise.all(newIssues)
    })
}


const handler = function(argv) {

  if(argv.dryRun) {
    console.log('-- Dry run -- ')
  }

  config.readConfiguration()
    .then(configuration => {

      if(!configuration.trello) {
        console.error('Configuration for Trello has not been provided, please run `trira target <jiraHost>` first')
        process.exit(1)
      }
      if(!configuration.jira) {
        console.error('Configuration for Jira has not been provided, please run `trira target <jiraHost>` first')
        process.exit(1)
      }

      // converting comma separated list of labels to array
      const labels = argv.addLabels === undefined ? [] : new String(argv.addLabels).split(',')
      
      return trelloCards.get(configuration.trello, argv.boardRegexp, argv.listRegexp, argv.cardRegexp)
        .then(cards => {
          logger.debug(`${argv.dryRun ? 'Would' : 'Will'} create ${cards.length} issues in JIRA`)

          cards.forEach(card => {
            card.labels = card.labels.concat(labels)
            // removing duplicates and empty items
            card.labels = [ ...new Set(card.labels)].filter(String)
          })

          return Promise.all([Promise.resolve(cards), argv.dryRun ? Promise.resolve([]) : pushCardsToJira(cards, argv.epic, configuration.jira) ])
        })
        .then(([cards, issues]) => {
          const createdIssueKeys = issues.map(issue => issue.key)

          if(argv.dryRun) {
            console.log('Trello card details')
            console.log(prettyjson.render(cards))
            console.log(`Dry-run - otherwise would create ${cards.length} issues linked to ${argv.epic}`)
          }
          else {
            console.log(stripIndent`
Created ${createdIssueKeys.length} issues in epic ${argv.epic} based on content of ${argv.listRegexp} lists in ${argv.boardRegexp} boards of Trello.

Following issues that have been created:
  - ${createdIssueKeys.map(key => `https://${configuration.jira.host}/browse/${key}`).join(`\n  - `)}
            `)
          }
        })
        .catch(err => {
          console.error(`Failed to sync issues, ${util.inspect(err)}`)
          process.exit(1)
        })
    })
    .catch(error => {
      console.error('Unable to load Trira configuration file')
    })
}

module.exports = {command, describe, builder, handler}
