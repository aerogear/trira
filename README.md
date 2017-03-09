# Trira

A tool that is able to convert cards in Trello board into JIRA. It creates JIRA Tasks based on content of cards and link them to
provided Epic.

## Prerequisites

* Node.js v6 or newer
* Trello API key and [Trello token](https://developers.trello.com/get-started/start-building)
* JIRA instance with Epic support
* JIRA user and password

## Usage


First, create an epic in JIRA that contain correct metadata, namely _Fix Version_. The value will be copied to all issues.

Afterwards install the tool via

```
npm install -g trira
```

Or, use development copy by
```
git clone https://github.com/kpiwko/trira.git && cd trira && npm install && npm link
```

First, provide credentials for Trello and JIRA. For example, a JIRA host could be _issues.jboss.org_.
```
trira target <jiraHost> --trello-key=<trello-key> --trello-token=<trello-token> --jira-user=<jira-user> --jira-password=<jira-password>
```

Afterwards, you run:
```
trira sync <trello-board-names> <jira-epic-name>
```

There are further options available, such as which Trello columns will be synced or a card name regular expression for more granular filtering. 
For more details about command usage, please run:
```
trira help sync
```

## Assumptions

* All checklists are included in JIRA description field
* Labels on cards in Trello are used to label issues in JIRA
* It is current not possible to sync data from JIRA to Trello
* Tool ignores existing issues, hence every run creates new issues - instead of updating them
* Tool creates issues where provided jira user acts as reporter
* Story points are represented in Trello card name - in the beginning as a number in parentheses, such as (3)
