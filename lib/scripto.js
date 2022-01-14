const fs = require("fs");
const path = require("path");
const debug = require("debug")("scripto");

function Scripto(redisClient) {
  const scripts = {};
  const scriptShas = {};
  this.load = function (scriptObject) {
    mergeObjects(scripts, scriptObject);
    loadScriptsIntoRedis(redisClient, scriptObject, afterShasLoaded);
  };

  this.loadFromFile = function (name, filepath) {
    const loadedScripts = {};
    loadedScripts[name] = fs.readFileSync(filepath, "utf8");
    this.load(loadedScripts);
  };

  this.loadFromDir = function (scriptsDir) {
    const loadedScripts = loadScriptsFromDir(scriptsDir);
    this.load(loadedScripts);
  };

  this.run = function (scriptName, keys, args, callback) {
    if (scripts[scriptName]) {
      if (scriptShas[scriptName]) {
        const sha = scriptShas[scriptName];
        evalShaScript(redisClient, sha, keys, args, callback);
      } else {
        const script = scripts[scriptName];
        evalScript(redisClient, script, keys, args, callback);
      }
    } else {
      callback(new Error("NO_SUCH_SCRIPT"));
    }
  };

  this.eval = function (scriptName, keys, args, callback) {
    if (scripts[scriptName]) {
      const script = scripts[scriptName];
      evalScript(redisClient, script, keys, args, callback);
    } else {
      callback(new Error("NO_SUCH_SCRIPT"));
    }
  };

  this.evalSha = function (scriptName, keys, args, callback) {
    if (scriptShas[scriptName]) {
      const sha = scriptShas[scriptName];
      evalShaScript(redisClient, sha, keys, args, callback);
    } else {
      callback(new Error("NO_SUCH_SCRIPT_SHA"));
    }
  };

  //load scripts into redis in every time it connects to it
  redisClient.on("connect", function () {
    debug("loading scripts into redis again, aftet-reconnect");
    loadScriptsIntoRedis(redisClient, scripts, afterShasLoaded);
  });

  //reset shas after error occured
  redisClient.on("error", function (err) {
    const errorMessage = err ? err.toString() : "";
    debug(
      "resetting scriptShas due to redis connection error: " + errorMessage
    );
    scriptShas = {};
  });

  function afterShasLoaded(err, shas) {
    if (err) {
      debug(
        "scripts loading failed due to redis command error: " + err.toString()
      );
    } else {
      debug("loaded scriptShas");
      mergeObjects(scriptShas, shas);
    }
  }

  function mergeObjects(obj1, obj2) {
    for (const key in obj2) {
      obj1[key] = obj2[key];
    }
  }
}

module.exports = Scripto;

function loadScriptsFromDir(scriptsDir) {
  const names = fs.readdirSync(scriptsDir);
  const scripts = {};

  names.forEach(function (name) {
    const filename = path.resolve(scriptsDir, name);
    const key = name.replace(".lua", "");

    scripts[key] = fs.readFileSync(filename, "utf8");
  });

  return scripts;
}

function loadScriptsIntoRedis(redisClient, scripts, callback) {
  let cnt = 0;
  const keys = Object.keys(scripts);
  const shas = {};

  (function doLoad() {
    if (cnt < keys.length) {
      const key = keys[cnt++];

      redisClient.send_command(
        "script",
        ["load", scripts[key]],
        function (err, sha) {
          if (err) {
            callback(err);
          } else {
            shas[key] = sha;
            doLoad();
          }
        }
      );
    } else {
      callback(null, shas);
    }
  })();
}

function evalScript(redisClient, script, keys, args, callback) {
  const keysLength = keys.length || 0;
  const arguments = [keysLength].concat(keys, args);
  arguments.unshift(script);

  redisClient.send_command("eval", arguments, callback);
}

function evalShaScript(redisClient, sha, keys, args, callback) {
  const keysLength = keys.length || 0;
  const arguments = [keysLength].concat(keys, args);
  arguments.unshift(sha);

  redisClient.send_command("evalsha", arguments, callback);
}
