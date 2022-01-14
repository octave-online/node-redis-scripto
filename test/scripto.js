const path = require("path");
const assert = require("assert");
const Redis = require("ioredis");
const Scripto = require("../");

const scriptDir = path.resolve(path.dirname(__filename), "scripts");

const redisClient = new Redis({ lazyConnect: true });

describe("Scripto", function () {
  before(function (done) {
    redisClient.connect(function (err) {
      done();
    });
  });
  after(function (done) {
    redisClient.disconnect();
    done();
  });

  afterEach(function (done) {
    redisClient.flushdb(function (err, res) {
      if (err) return done(err);
      done();
    });
  });

  describe("Env working", function () {
    it("ping", function (done) {
      redisClient.ping(function (err, result) {
        console.log(`redis ping ${JSON.stringify(result)}`);
        assert.equal(err, null);
        assert.equal(result, "PONG");
        done();
      });
    });
  });
  describe("eval", function () {
    it("running normally", function (done) {
      const s = new Scripto(redisClient);
      s.loadFromDir(scriptDir);
      s.eval("read-write", ["helloKey"], [200], function (err, result) {
        assert.equal(err, null);
        assert.equal(result, 200);
        done();
      });
    });

    it("running non-existing script", function (done) {
      const s = new Scripto(redisClient);
      s.loadFromDir(scriptDir);
      s.eval("no-such-script", ["helloKey"], [200], function (err, result) {
        assert.equal(err.message, "NO_SUCH_SCRIPT");
        assert.equal(result, undefined);
        done();
      });
    });
  });

  describe("evalSha", function () {
    it("failed at initial call", function (done) {
      const s = new Scripto(redisClient);
      s.loadFromDir(scriptDir);
      s.evalSha("read-write", ["helloKey"], [200], function (err, result) {
        assert.equal(err.message, "NO_SUCH_SCRIPT_SHA");
        assert.equal(result, undefined);
        done();
      });
    });

    it("success at runs after script loaded (some millis later)", function (done) {
      const s = new Scripto(redisClient);
      s.loadFromDir(scriptDir);

      setTimeout(function () {
        s.evalSha("read-write", ["hello2Key"], [300], afterEvalSha);
      }, 100);

      function afterEvalSha(err, result) {
        assert.equal(err, undefined);
        assert.equal(result, 300);
        done();
      }
    });
  });

  describe("run", function () {
    it("success at initial call", function (done) {
      const s = new Scripto(redisClient);
      s.loadFromDir(scriptDir);
      s.run("read-write", ["helloKey"], [200], function (err, result) {
        assert.equal(err, undefined);
        assert.equal(result, 200);
        done();
      });
    });

    it("success at runs after script loaded (some millis later, then uses sha)", function (done) {
      const s = new Scripto(redisClient);
      s.loadFromDir(scriptDir);

      setTimeout(function () {
        s.run("read-write", ["hello2Key"], [300], afterEvalSha);
      }, 100);

      function afterEvalSha(err, result) {
        assert.equal(err, undefined);
        assert.equal(result, 300);
        done();
      }
    });
  });

  it("load scripts from an object", function (done) {
    const scripts = { "script-one": "return 1000;" };
    const s = new Scripto(redisClient);
    s.load(scripts);

    s.run("script-one", [], [], function (err, result) {
      assert.equal(err, null);
      assert.equal(result, 1000);
      done();
    });
  });

  it("load a script from file", function (done) {
    const s = new Scripto(redisClient);
    s.loadFromFile("read-write", path.resolve(scriptDir, "read-write.lua"));

    s.run("read-write", ["helloKey"], [200], function (err, result) {
      assert.equal(err, null);
      assert.equal(result, 200);
      done();
    });
  });

  it("load a script from dir", function (done) {
    const s = new Scripto(redisClient);
    s.loadFromDir(path.resolve(scriptDir));

    s.run("read-write", ["helloKey"], [200], function (err, result) {
      assert.equal(err, null);
      assert.equal(result, 200);
      s.run("read-write-copy", ["helloKey"], [200], function (err, result) {
        assert.equal(err, null);
        assert.equal(result, 200);
        done();
      });
    });
  });
});
