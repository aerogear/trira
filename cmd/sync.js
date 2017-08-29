'use strict'

const Jira = require('jira-client')
const trelloCards = require('../lib/trello')
const prettyjson = require('prettyjson')
const stripIndent = require('common-tags').stripIndent
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
    .demand(2)
    .help('help')
    .wrap(null)
}

const transformToJiraFormat = function (parentEpic, card) {

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
      labels: ['test-case'].concat(card.labels),
      // epic link
      customfield_12311140: parentEpic.key
    }
  }

  // add all checklists to description
  issue.fields.description += Object.keys(card.details).reduce((details, listName) => {
        return `${details}\nh3. ${listName}\n${card.details[listName].map((value, index) => `${index+1}. ${value}`).join(`\n`)}`
      }, '')

  if(card.storyPoints) {
    issue.fields['customfield_12310243'] = parseFloat(card.storyPoints)
  }


  return issue
}

const pushCardsToJira = function (cards, epic, jiraConfig) {

  const config = Object.assign({
    protocol: 'https',
    port: 443,
    apiVersion: 2,
    strictSSL: true
  }, jiraConfig)

   const jira = new Jira(config)

   console.log(`Fetching epic ${epic} from JIRA to act as template for issues`)
   return jira.findIssue(epic)
     .then(epic => {

       if(epic.fields.issuetype.name !== 'Epic') {
         return Promise.reject(`Issue ${epic} is not an epic in JIRA`)
       }

       const newIssues = []
       cards.forEach(card => {
         newIssues.push(jira.addNewIssue(transformToJiraFormat(epic, card)))
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

      return trelloCards.get(configuration.trello, argv.boardRegexp, argv.listRegexp, argv.cardRegexp)
        .then(cards => {
          logger.debug(`${argv.dryRun ? 'Would' : 'Will'} create ${cards.length} issues in JIRA`)
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
              Created ${createdIssueKeys.length} issues in epic ${argv.epic} based on content of ${argv.listRegexp}
              lists in ${argv.board} of Trello.

              Following issues that have been created:
                  - ${createdIssueKeys.map(key => `https://${configuration.jira.host}/browse/${key}`).join(`\n    - `)}
            `)
          }
        })
        .catch(err => {
          console.log(err)
          process.exit(1)
        })
    })
}

module.exports = {command, describe, builder, handler}
