const assert = require('assert');
const taskcluster = require('taskcluster-client');
const {TaskGraph, ConsoleRenderer, LogRenderer} = require('console-taskgraph');

const copy = async ({utils, iter, each}) => {
  utils.step({title: 'Fetching'});

  let items = [];
  for await (let item of iter) {
    items.push(item);
  }

  utils.step({title: 'Copying'});
  const N = items.length;
  let i = 0;
  for (let item of items) {
    utils.status({message: item.name, progress: i * 100 / N});
    await each(item);
    i++;
  }
};

const copySecrets = async ({utils, src, dst}) => {
  const s = new taskcluster.Secrets(src);
  const d = new taskcluster.Secrets(dst);

  async function* listSecrets() {
    let query = {};
    while (1) {
      const res = await s.list(query);

      for (const name of res.secrets) {
        yield {name};
      }

      if (res.continuationToken) {
        query.continuationToken = res.continuationToken;
      } else {
        break;
      }
    }
  }

  async function createSecret({name}) {
    await d.set(name, {
      expires: taskcluster.fromNow('10 minutes'),
      secret: {},
    });
  }

  await copy({utils, iter: listSecrets(), each: createSecret});
};

const copyClients = async ({utils, src, dst}) => {
  const s = new taskcluster.Auth(src);
  const d = new taskcluster.Auth(dst);

  async function* listClients() {
    let query = {};
    while (1) {
      const res = await s.listClients(query);

      for (const client of res.clients) {
        if (client.clientId.startsWith('static/')) {
          continue;
        }
        yield {name: client.clientId, ...client};
      }

      if (res.continuationToken) {
        query.continuationToken = res.continuationToken;
      } else {
        break;
      }
    }
  }

  async function createClient({clientId, description, expires, deleteOnExpiration, scopes}) {
    try {
      await d.createClient(clientId, {description, expires, deleteOnExpiration, scopes});
    } catch (err) {
      if (err.statusCode === 409) {
        await d.updateClient(clientId, {description, expires, deleteOnExpiration, scopes});
      } else {
        throw err;
      }
    }
  }

  await copy({utils, iter: listClients(), each: createClient});
};

const copyHooks = async ({utils, src, dst}) => {
  const s = new taskcluster.Hooks(src);
  const d = new taskcluster.Hooks(dst);

  async function* listHooks() {
    const res = await s.listHookGroups();
    for (const hookGroupId of res.groups) {
      const res = await s.listHooks(hookGroupId);
      for (const hook of res.hooks) {
        yield {name: `${hookGroupId}/${hook.hookId}`, ...hook};
      }
    }
  }

  async function createHook({name, ...hook}) {
    await d.createHook(hook.hookGroupId, hook.hookId, hook);
  }

  await copy({utils, iter: listHooks(), each: createHook});
};

const main = async () => {
  const e = env => {
    assert(process.env[env], `${env} not set`);
    return process.env[env];
  };

  const src = {
    rootUrl: e('SRC_ROOT_URL'),
  };
  const dst = {
    rootUrl: e('TASKCLUSTER_ROOT_URL'),
    credentials: {
      clientId: e('TASKCLUSTER_CLIENT_ID'),
      accessToken: e('TASKCLUSTER_ACCESS_TOKEN'),
    }
  };

  const tasks = [{
    title: "Copy Secrets",
    run: async (requirements, utils) => copySecrets({requirements, utils, src, dst}),
  }, {
    title: "Copy Clients",
    run: async (requirements, utils) => copyClients({requirements, utils, src, dst}),
  }, {
    title: "Copy Hooks",
    run: async (requirements, utils) => copyHooks({requirements, utils, src, dst}),
  }];

  const taskgraph = new TaskGraph(tasks, {
    renderer: process.stdout.isTTY ?
      new ConsoleRenderer({elideCompleted: false}) :
      new LogRenderer(),
  });
  await taskgraph.run();
};

const run = (main) => {
  main().then(
    () => {},
    err => {
      console.error(err);
      process.exit(1);
    });
};

run(main);
