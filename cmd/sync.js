'use strict'

const Trello = require('trello')
const Jira = require('jira-client')
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

  Synces cards in a Trello Board <board-regexp> with JIRA Epic <epic>`)
    .option('dry-run', {
      describe: 'Do not push anything to JIRA',
      default: false
    })
    .option('lists', {
      describe: 'Lists to be fetched',
      default: ['MUST PER RELEASE', 'MUST PER BUILD'],
      defaultDescription: 'Default lists to be fetched from boards',
      type: 'array'
    })
    .option('card-regexp', {
      describe: 'Cards name regular expression to be fetched',
      default: '.*',
      defaultDescription: 'Fetch all cards by default'
    })
    .demand(2)
    .help('help')
    .wrap(null)
}

// FIXME move to separate module
const getTrelloCards = function(boardRegexp, listNames, cardRegexp, trelloConfig) {

  const trello = new Trello(trelloConfig.key, trelloConfig.token)

  return trello.getMember('me')
    // find all organizations which current user is a member of
    .then(member => {
      if(member.idOrganizations.lenght === 0) {
        return Promise.reject('This user is not a member of any organization')
      }
      return Promise.resolve(member.idOrganizations)
    })
    // list all boards in the organizations
    .then(organizations => {
      const orgBoards = organizations.reduce((orgBoards, org) => {
        orgBoards.push(trello.getOrgBoards(org))
        return orgBoards
      }, [])
      return Promise.all(orgBoards)
    })
    // find boards that match with `boardRegexp`
    .then(boards => {
      const boardNameRegexp = new RegExp(boardRegexp)
      const matchingBoards = boards.reduce((matchingBoards, orgs) => {
        return matchingBoards.concat(orgs.filter(board => boardNameRegexp.test(board.name)))
      }, [])
      if(matchingBoards.length === 0) {
        return Promise.reject(`There is no board matching '${boardRegexp}' associated with that user`)
      }

      logger.debug(`Found ${matchingBoards.length} boards matching ${boardRegexp}`, {boards: matchingBoards.map(b => b.name)})
      return Promise.resolve(matchingBoards)
    })
    // find all lists in boards
    .then(boards => {
      const lists = boards.reduce((lists, board) => {
        lists.push(trello.getListsOnBoard(board.id))
        return lists
      }, [])
      return Promise.all(lists)
    })
    // find all the list in boards that match name
    .then(lists => {

      listNames = Array.isArray(listNames) ? listNames: [listNames]

      const matchingLists = lists.reduce((matchingLists, lists) => {
        return matchingLists.concat(lists.filter(list => {
          let found = false
          // find any match with provided list names
          listNames.forEach(name => {
              found = found || list.name.startsWith(name)
          })
          return found
        }))
      }, [])

      if(matchingLists.length === 0) {
        return Promise.reject(`There are no lists on associated boards starting with any of ${listName.join(', ')}`)
      }

      logger.debug(`There are ${matchingLists.length} lists that contain tasks to be synced.`, {lists: matchingLists.map(l => l.name)})

      return Promise.resolve(matchingLists)
    })
    // query all lists for cards
    .then(lists => {

      const cards = lists.reduce((cards, list) => {
        cards.push(trello.getCardsOnList(list.id))
        return cards
      }, [])

      return Promise.all(cards)
    })
    // make sure that we attach checklists as well
    .then(cards => {

      logger.debug(`Populating card checklists`)

      const checkLists = cards.reduce((checkLists, cards) => {
        cards.forEach(card => {
          checkLists.push(trello.getChecklistsOnCard(card.id))
        })
        return checkLists
      }, [ Promise.resolve(cards) ] )

      return Promise.all(checkLists)
    })
    // fixme should probably do the same with attachements?
    // combine together
    .then(results => {

      const cardNameRegexp = new RegExp(cardRegexp)

      const cardLists = results.shift()
      let cards = []
      cardLists.forEach(cardList => {
        cardList.forEach(card => {
          if(cardNameRegexp.test(card.name)) {
            cards.push(card)
          }
        })
      })

      // process checklists and add them to cards
      results.forEach(checklists => {
        checklists.forEach(checklist => {
            const addChecklistTo = cards.filter(card => card.id === checklist.idCard)
            addChecklistTo.forEach(card => {
              card.checklists = card.checklists ? card.checklists : {}
              card.checklists[checklist.name] = checklist
            })
        })
      })

      // remap to human readable representation
      cards = cards.map(card => {
        return transformCardToHumanReadable(card)
      })

      return Promise.resolve(cards)
    })
    .catch(err => {
      console.error(`Unable to fetch cards from Trello`)
      return Promise.reject(err)
    })
}

const transformCardToHumanReadable = function(card) {

  let details = {}
  if(card.checklists && Object.keys(card.checklists).length > 0) {
    Object.keys(card.checklists).forEach(name => {
      details[name] = card.checklists[name].checkItems.map(item => item.name)
    })
  }

  const spRegexp = /^\((\d+(?:\.\d+)?)\)\s*(.*)$/
  const cardNameAndSp = spRegexp.exec(card.name)

  let summary = card.name
  let storyPoints = null
  if(cardNameAndSp) {
    [, storyPoints, summary] = cardNameAndSp
  }

  return {
    summary,
    storyPoints,
    description: card.desc,
    cardLink: card.shortUrl,
    labels: card.labels ? card.labels.map(l => l.name) : [],
    details
  }
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
        console.error('Configuration for Trello has not been provided, please run `trira target <jiraHost>` first')
        process.exit(1)
      }

      return getTrelloCards(argv.boardRegexp, argv.lists, argv.cardRegexp, configuration.trello)
        .then(cards => {
          logger.debug(`Would create ${cards.length} issues in JIRA`)
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
              Created ${createdIssueKeys.length} issues in epic ${argv.epic} based on content of ${argv.lists.join(', ')}
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
