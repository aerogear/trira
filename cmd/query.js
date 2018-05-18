'use strict'

const prettyjson = require('prettyjson')
const json2csv = require('json2csv')
const stripIndent = require('common-tags').stripIndent
const trelloCards = require('../lib/trello')
const config = require('../lib/config')
const logger = require('../lib/logger')

const command = 'query <board-regexp>'
const describe = 'Queries Trello boards for cards matching particular pattern'
const builder = function (yargs) {

  const HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE

  return yargs
    .usage(`usage: $0 query <board-regexp> [options]

  Queries Trello boards for cards matching particular pattern. Lists content as prettyjson by default`)
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
    .option('card-details-regexp', {
      describe: 'Cards content regular expression. Case insensitive',
      default: '.*',
      defaultDescription: 'Fetch all cards by default'
    })
    .option('json', {
      describe: 'Print out query outcome in JSON format',
      default: false
    })
    .option('fields', {
      describe: 'Trello card fields that will be include in output',
      default: 'summary,cardLink,description',
      defaultDescription: 'Summary, link and description fields. Other fields are "details", "labels" and "storyPoints"'
    })
    .option('csv', {
      describe: 'Print out query outcome in CSV format',
      default: false
    })
    .option('tsv', {
      describe: 'Print out query outcome in Tab Separated Value format',
      default: false
    })
    .demand(1)
    .help('help')
    .wrap(null)
}

const handler = function(argv) {

  config.readConfiguration()
    .then(configuration => {

      if(!configuration.trello) {
        console.error('Configuration for Trello has not been provided, please run `trira target <jiraHost>` first')
        process.exit(1)
      }

      return trelloCards.get(configuration.trello, argv.boardRegexp, argv.listRegexp, argv.cardRegexp)
        .then(cards => {
          logger.debug(`Query contains ${cards.length} cards prior card content filter is applied.`)          
          const cardDetailsRegexp = new RegExp(argv.cardDetailsRegexp)

          cards = cards.filter(card => {
            return cardDetailsRegexp.test(card.summary) ||
              cardDetailsRegexp.test(card.description) ||
              cardDetailsRegexp.test(card.details) ||
              card.labels.filter(label => cardDetailsRegexp.test(label)).length > 0
          })

          const fields = argv.fields.split(',')

          cards = cards.map(card => {
            return Object.assign(...Object.keys(card)
                    .filter(key => fields.includes(key))
                    .map(key => ({ [key]: card[key].replace(/(\n\r?)/g, String.fromCharCode(10)) })) 
            );
          }) 
          return Promise.resolve(cards)
        })
        .then(data => {
          logger.debug(`Query contains ${data.length} cards after content filter was applied.`)
          if(argv.json) {
            console.log(JSON.stringify(data, null, 2))
          }
          else if(argv.csv) {
            console.log(json2csv({
              cards,
              hasCSVColumnTitle: false
            }))
          }
          else if(argv.tsv) {
            console.log(json2csv({
              data,
              hasCSVColumnTitle: false,              
              //newLine: '\r',
              del: '\t'
            }))
          }
          else {
            console.log(prettyjson.render(data))
          }
        })
        .catch(err => {
          console.log(err)
          process.exit(1)
        })
    })
}

module.exports = {command, describe, builder, handler}
