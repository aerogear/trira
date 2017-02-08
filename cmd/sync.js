'use strict'

const Trello = require('trello')
const Jira = require('jira-client')
const prettyjson = require('prettyjson')

const command = 'sync <board> <epic>'
const describe = 'Sync Trello Board with particular Epic in JIRA'
const builder = function (yargs) {

  const HOME = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE

  return yargs
    .usage(`usage: $0 sync <board> <epic> [options]

  Synces cards in a Trello Board <board> with JIRA Epic <epic>`)
    .option('trello-key', {
      describe: 'Trello API key',
      demand: true
    })
    .option('trello-token', {
      describe: 'Trello token',
      demand: true
    })
    .option('dry-run', {
      describe: 'Do not push anything to JIRA',
      default: false
    })
    .option('lists', {
      describe: 'Lists to be fetched',
      default: ['MUST PER RELEASE', 'MUST PER BUILD'],
      defaultDescription: 'Default lists to be fetched from boards'
    })
    .option('card-regexp', {
      describe: 'Cards name regular expression to be fetched',
      default: '.*',
      defaultDescription: 'Fetch all cards by default'
    })
    .option('jira-host', {
      describe: 'Jira host to connect to',
      default: 'issues.jboss.org',
      defaultDescription: 'JBoss.org JIRA'
    })
    .option('jira-user', {
      describe: 'JIRA username',
      demand: true
    })
    .option('jira-password', {
      describe: 'JIRA password',
      demand: true
    })
    .demand(2)
    .help('help')
    .wrap(null)
}

// FIXME move to separate module
const getTrelloCards = function(boardName, listNames, cardRegexp, key, token) {

  const trello = new Trello(key, token)

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
    // find boards that start with `boardName`
    .then(boards => {
      const matchingBoards = boards.reduce((matchingBoards, orgs) => {
        return matchingBoards.concat(orgs.filter(board => board.name.startsWith(boardName)))
      }, [])
      if(boards.length === 0) {
        return Promise.reject(`There is no board starting with '${boardName}' associated with that user`)
      }
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
          listNames.forEach(name => {
              found = found || list.name.startsWith(name)
          })
          return found
        }))
      }, [])

      if(matchingLists.length === 0) {
        return Promise.reject(`There are no lists on associated boards starting with any of ${listName.join(', ')}`)
      }

      console.log(`There are ${matchingLists.length} lists that contain tasks to be synced.`)

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

      console.log('Fetching checklists for cards')

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

      console.log(`There are ${cards.length} to be synced with JIRA`)

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

  return {
    summary: card.name,
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
      description: `${card.description}

      [Trello link|${card.cardLink}]
      `,
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

  const stepsToReproduce = Object.keys(card.details).find(list => {
    return list.toLowerCase().startsWith('Steps'.toLowerCase())
  })

  if(stepsToReproduce) {
    issue.fields['customfield_12310183'] = `${card.details[stepsToReproduce].map((value, index) => `${index+1}. ${value}`).join(`\n`)}`
  }


  return issue
}

const pushCardsToJira = function (cards, epic, jiraHost, jiraUser, jiraPassword) {

   const jira = new Jira({
     protocol: 'https',
     host: jiraHost,
     port: 443,
     username: jiraUser,
     password: jiraPassword,
     apiVersion: 2,
     strictSSL: true
   })

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

  const cards = getTrelloCards(argv.board, argv.lists, argv.cardRegexp, argv.trelloKey, argv.trelloToken)
    .catch(err => {
      console.log(err)
      process.exit(1)
    })

  if(argv.dryRun) {
    cards.then(cards => {
      console.log(`Dry run, otherwise would create ${cards.length} issues in ${argv.epic}`)
      console.log(prettyjson.render(cards))
    })
  }
  else {
    cards.then(cards => {
      return pushCardsToJira(cards, argv.epic, argv.jiraHost, argv.jiraUser, argv.jiraPassword)
    })
    .then(createdIssues => {
      const createdIssueKeys = createdIssues.map(issue => issue.key)

      console.log(`Created ${createdIssueKeys.length} issues in epic ${argv.epic} based on content of ${argv.lists.join(', ')}
lists in ${argv.board} of Trello.
Following issues that have been created:
    - ${createdIssueKeys.map(key => `https://${argv.jiraHost}/browse/${key}`).join(`\n    - `)}`)
    })
  }

}

module.exports = {command, describe, builder, handler}
