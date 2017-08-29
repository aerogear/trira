'use strict'

const Trello = require('trello')
const logger = require('./logger')

const getTrelloCards = function(trelloConfig, boardRegexp = '.*', listRegexp = '.*', cardRegexp = '.*') {

  const trello = new Trello(trelloConfig.key, trelloConfig.token)

  return trello.getMember('me')
    // find all organizations which current user is a member of
    .then(member => {
      if(member.idOrganizations.length === 0) {
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
      const boardNameRegexp = new RegExp(boardRegexp, 'i')
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

      const listNameRegexp = new RegExp(listRegexp, 'i')
      const matchingLists = lists.reduce((matchingLists, lists) => {
        return matchingLists.concat(lists.filter(list => listNameRegexp.test(list.name)))
      }, [])

      if(matchingLists.length === 0) {
        return Promise.reject(`There are no lists on associated boards matching '${listRegexp} within matching organization boards`)
      }

      logger.debug(`There are ${matchingLists.length} associated lists.`, {lists: matchingLists.map(l => l.name)})

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

module.exports = {
  get: getTrelloCards
}