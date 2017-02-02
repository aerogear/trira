# Trira

A tool that is able to convert cards in Trello board into JIRA. It creates JIRA Tasks based on content of cards and link them to
provided Epic.

## Prerequisites

* Node.js v6 or newer
* Trello API key and Trello token
* JIRA instance with Epic support
* JIRA user and password

## Usage


First, create an epic in JIRA, that contain correct metadata, namely _Fix Version_. The value will be copied to all issues.

Afterwards install the tool via

```
npm install -g trira
```

Or, use development copy by
```
git clone https://github.com/kpiwko/trira.git && cd trira && npm link
```

Afterward, you run:
```
trira <trello-board-name> <jira-epic-name> --trello-key=<trello-key> --trello-token=<trello-token> --jira-user=<jira-user> --jira-password=<jira-password>
```

There are further options available, such as which Trello columns will be transferred or JIRA host with default values. For more details,
please run:
```
trira help sync
```

## Assumptions

* The first checklist in Trello board, that starts with name _Steps_ will act as Steps to Reproduce field in JIRA
* Labels on cards in Trello are used to label issues in JIRA
* It is current not possible to sync data from JIRA to Trello
* Tool ignores existing issue, hence every run creates new issues - instead of updating them
* Tool creates issues where provided jira user acts are reporter
