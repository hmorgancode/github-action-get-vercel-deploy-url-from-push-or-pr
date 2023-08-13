const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios').default;
const wait = require('./wait');

// most @actions toolkit packages have async methods
async function run() {
  try {
    const ms = parseInt(core.getInput('delay-fetch-ms'));
    core.info(`Waiting ${ms} milliseconds to hit Vercel's API`);
    core.info('(this isn\'t necessary but it soothes a primate impulse in my brain to know that the deploy WILL DEFINITELY have started)')
    await wait(ms);

    core.info('getting Octokit');
    const octokit = github.getOctokit(process.env.GITHUB_TOKEN);
    core.info('got Octokit');

    let deployCommit = '';
    if (github.context.eventName === 'push') { // this is good. this works fine.
      core.info('push event');
      deployCommit = github.context.sha;
    } else if (github.context.eventName === 'pull_request') {
      core.info('PR event');
      const currentPR = await octokit.rest.pulls.get({
        owner: github.context.payload.repository.owner.login, // 'bramarcade', pretty confident this is good
        repo: github.context.payload.repository.name, // 'bram-arcade' // ppretty confident in this one too
        pull_number: github.context.payload.number, // 1, 2, 3...
      });
      core.info('successful PR fetch');
      if (currentPR.status !== 200) {
        throw 'Could not get information about the current pull request';
      }
      deployCommit = currentPR.data.head.sha;
    } else {
      throw 'Action was not run on a push or a pull request. Could not find deployCommit.';
    }

    core.info('doing an axios');
    const res = await axios.get('https://api.vercel.com/v6/deployments', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      },
      // params: {
      //   teamId: process.env.VERCEL_TEAM_ID,
      // }
    });
    core.info('axios done');
    core.debug(res.data);
    let deploy = res.data.deployments.find((deploy) => deploy.meta.githubCommitSha === deployCommit);
    core.debug(deploy);
    if (!deploy) {
      // The only time this happens that I know of is a dependabot merge.
      // only one person should ever be responsible for these at a time, so unlike with
      // user commits, concurrency shouldn't be a problem. hence, we just grab the latest dependabot build.
      deploy = res.data.deployments.find((deploy) => deploy.creator.githubLogin === 'dependabot[bot]');
      core.debug(deploy);
    }
    core.debug(deploy);
    core.setOutput('deploymentUrl', deploy.url);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
