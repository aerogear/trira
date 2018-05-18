# Trira

A tool that is able to convert cards in Trello board into JIRA. It creates JIRA Tasks based on content of cards and link them to
provided Epic.

## Prerequisites

* Node.js v6 or newer
* Trello API key and [Trello token](https://developers.trello.com/get-started/start-building)
* JIRA instance with Greenhopper Epic support
* JIRA user and password

## Usage


1. Create an epic in JIRA. If that JIRA contains metadata, namely _Fix Version_, the value will be copied to all created issues.

2. Install the trira tool:

```
npm install -g trira
```

To use development version:
```
git clone https://github.com/aerogear/trira.git && cd trira && npm install && npm link
```

3. Provide credentials for Trello and JIRA. For example, a JIRA host could be _issues.jboss.org_.
```
trira target <jiraHost> --trello-key=<trello-key> --trello-token=<trello-token> --jira-user=<jira-user> --jira-password=<jira-password> [--strict-ssl=true|false]
```

4. To create Jiras from all lists in a trello board:
```
trira sync <trello-board-regexp> <jira-epic-name-or-key> --list-regexp '.*'
```

There are further options available, such as which Trello columns will be synced or a card name regular expression for more granular filtering. For more details about command usage, run:
```
trira help sync
```

## Assumptions

* All checklists are included in JIRA description field
* Labels on cards in Trello are used to label issues in JIRA (labels in Trello can't contain spaces)
* It is current not possible to sync data from JIRA to Trello
* Tool ignores existing issues, hence every run creates new issues - instead of updating them
* Tool creates issues where provided jira user acts as reporter
* Story points are represented in Trello card name - in the beginning as a number in parentheses, such as (3)
