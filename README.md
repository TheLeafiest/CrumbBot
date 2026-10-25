# CrumbBot
Bot for the Crumb Crew
Made for doing a daily check-in on Crumb Crew members

## Development

Requires Node 24.

```bash
npm ci
npm run typecheck
npm test              # compiles to dist/ and runs the node:test suite
```

To run locally, put a `config.json` (and optionally `birthdays.json` and an `images/` folder)
in the project root, then:

```bash
npm run build
npm run deploy-commands   # register slash commands with the guild
npm start
```

### config.json

| Key | Type | Purpose |
|---|---|---|
| `token` | string | Discord bot token |
| `clientId` | string | Application ID |
| `guildId` | string | Server the slash commands are registered in |
| `generalChannelId` | string | Channel for birthday messages |
| `chipCheckChannelId` | string | Channel for Chip Check |
| `serverOptions` | string[] | Game servers offered by `/server-command` |
| `serverUrl` | string | Base URL of the game-server control API |
| `serverInfo` | object | Per-server details shown by `/server-command info` |

| `gameRequests` | object, optional | Ideas and bug reports forum (below). Leave out to turn the feature off |

The bot checks these at startup and lists every missing or invalid key.

### Game ideas and bug reports

Friends submit ideas and bug reports for the game to a Discord forum channel, and approvers
triage them. To set it up:

1. Create a **forum** channel (for example `#game-ideas`) with these tags, spelled exactly:
   `Idea`, `Bug`, `New`, `Approved`, `Declined`, `Duplicate`, `Shipped`.
2. Create an approver role (for example `Game Dev`) with **no permissions**, and give it to
   everyone who should approve. The bot only checks that the role is there.
3. In the forum, allow the bot: View Channel, Create Posts, Send Messages in Posts,
   Manage Posts, Add Reactions, Read Post History and Embed Links (the names Discord
   shows in a forum channel's permission settings).
4. Add to `config.json` (Developer Mode → right-click → Copy ID):

   ```json
   "gameRequests": {
     "forumChannelId": "<forum channel id>",
     "approverRoleId": "<approver role id>",
     "maxOpenPerUser": 3
   }
   ```

   `maxOpenPerUser` is optional and defaults to 3.

On startup the log shows `Game requests: ready in #game-ideas`, or `Game requests are OFF`
followed by every problem it found (wrong channel, missing tags, missing permissions or an
unknown role).

## Deploying

Every push to `main` triggers the **Build and publish image** GitHub Action. It builds the
Docker image, which runs the tests, and pushes it to Docker Hub as:

- `theleafiest/crumbbot:latest`
- `theleafiest/crumbbot:sha-<commit>` (for example `sha-d869b22`)

A failing test stops the build, so nothing is published. Pull requests build and test only.

The workflow needs the repository secret `DOCKERHUB_TOKEN` (a Docker Hub personal access
token with Read & Write access) and the variable `DOCKERHUB_USERNAME`.

### Updating Unraid

Unraid is updated by hand once the Action has finished:

1. In the Unraid **Docker** tab, open the CrumbBot container's menu and choose
   **Force update**. It pulls `latest` and recreates the container with the same settings.
2. Check the container log for `Ready! Logged in as ...`.

The container needs these paths mapped from the host; they are never part of the image:

| Container path | Contents |
|---|---|
| `/crumbbot/config.json` | Bot configuration (see above) |
| `/crumbbot/birthdays.json` | Saved birthdays, written by `/add-birthday` |
| `/crumbbot/images` | `.jpg` images for `CRUMB ME` |

### Rolling back

Edit the container in Unraid, change the repository from `theleafiest/crumbbot` (`latest`)
to a known-good tag such as `theleafiest/crumbbot:sha-d869b22`, and apply. Switch back to
`theleafiest/crumbbot` once a fixed image is published.
