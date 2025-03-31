#!/usr/bin/env node

const DEFAULT_PORT = 9080;
const DEFAULT_INDEX = 'index.html';
const DEFAULT_FOLLOW_SYMLINKS = false;
const DEFAULT_ERROR_404 = undefined;
const DEFAULT_CORS = undefined;
const DEFAULT_CACHE = false;
const DEFAULT_OPEN = false;
const DEFAULT_LOG_LEVEL = 'info';

var path    = require("path");
var pkg     = require('./package.json');

var StaticServer = require('./server.js');

const options = parseOptions();
const logLevel = options.logLevel;

const server = new StaticServer(options);

initTerminateHandlers();

server.start(function () {
  warn('Server started:', chalk.cyan('http://localhost:' + options.port));
  info('Press', chalk.yellow.bold('Ctrl+C'), 'to shutdown.');
  warn();

  return server;
});

server.on('request', function (req, res) {
  trace(chalk.gray('<--'), chalk.blue('[' + req.method + ']'), req.path);
});

server.on('symbolicLink', function (link, file) {
  trace(chal.cyan('---'), '"' + path.relative(server.rootPath, link) + '"', chalk.magenta('>'), '"' + path.relative(server.rootPath, file) + '"');
});

server.on('response', function (req, res, err, file, stat) {
  var relFile;
  var nrmFile;

  if (res.status >= 400) {
    error(chalk.gray('-->'), chalk.blue('[' + req.method + ']'), chalk.red(res.status), req.path, '(' + req.elapsedTime + ')');
  } else if (file) {
    relFile = path.relative(server.rootPath, file);
    nrmFile = path.normalize(req.path.substring(1));

    info(
        chalk.gray('-->'),
        chalk.blue('[' + req.method + ']'),
        chalk.green(res.status, StaticServer.STATUS_CODES[res.status]),
        req.path + (nrmFile !== relFile ? (' ' + chalk.dim('(' + relFile + ')')) : ''),
        chalk.gray(formatSize(stat.size) + ' (' + req.elapsedTime + ')')
    );
  } else {
    info(
        chalk.gray('-->'),
        chalk.blue('[' + req.method + ']'),
        chalk.green.dim(res.status, StaticServer.STATUS_CODES[res.status]),
        req.path,
        chalk.gray('(' + req.elapsedTime + ')')
    );
  }

  if (err) {
    error(chalk.red('ERROR ::'), err.stack || err.message || err);
  }
});

server.on('mimetype-not-found', function (ext) {
    error(chalk.bold.red('!!!'), 'Mime type not found for ext:', chalk.red(ext));
});

/**
Prepare the 'exit' handler for the program termination
*/
function initTerminateHandlers() {
  var readLine;

  if (process.platform === "win32"){
    readLine = require("readline");

    readLine.createInterface ({
      input: process.stdin,
      output: process.stdout
    }).on("SIGINT", function () {
      process.emit("SIGINT");
    });
  }

  // handle INTERRUPT (CTRL+C) and TERM/KILL signals
  process.on('exit', function () {
    if (server) {
      warn('Shutting down...\n');
      server.stop();
    }
  });

  process.on('SIGINT', function () {
    console.log();
    trace(chalk.yellow.bold('SIGINT'), 'detected');
    process.exit();
  });

  process.on('SIGTERM', function () {
    console.log();
    trace(chalk.yellow.bold('SIGTERM'), 'detected');
    process.exit(0);
  });
}


function trace(... parts) {
    if (logLevel !== 'trace') {
        return;
    }
    console.log(... parts);
}

function info(... parts) {
    if (logLevel === 'warn' || logLevel === 'error') {
        return;
    }
    console.log(... parts);
}

function warn(... parts) {
    if (logLevel === 'error') {
        return;
    }
    console.log(... parts);
}

function error(...parts) {
    console.log(... parts);
}

function getFlagOption(options) {
    return process.argv.some(arg => options.includes(arg));
}

function getValueOption(options) {
    const rx = new RegExp(`^(?:${ options.join('|') })(=(.+))?$`);

    return process.argv.reduce((res, arg, idx, arr) => {
            const matched = rx.exec(arg);

            return matched
                ? matched[1] && matched[2] || arr[idx + 1]
                : res;
        },

        undefined
    );
}

function parseOptions() {
    if (getFlagOption(['-v', '--version'])) {
        console.log(pkg.version);
        process.exit(0);
    }

    if (getFlagOption(['-h', '--help'])) {
        printHelp();
        process.exit(0);
    }

    const rootPath = process.argv.length >= 3
                        && !/^-/.test(process.argv[process.argv.length - 1])
                        && !/^-/.test(process.argv[process.argv.length - 2])
                     ? process.argv[process.argv.length - 1]
                     : undefined;

    return {
        port:          getValueOption(['-p', '--port'])             ?? DEFAULT_PORT,
        followSymlink: getValueOption(['-f', '--follow-symlinks'])  ?? DEFAULT_FOLLOW_SYMLINKS,
        cors:          getValueOption(['-c', '--cors'])             ?? DEFAULT_CORS,
        logLevel:      getValueOption(['-l', '--log-level'])        ?? DEFAULT_LOG_LEVEL,

        cache:         getFlagOption(['-z', '--cache'])  ?? DEFAULT_CACHE,

        name: pkg.name,
        rootPath: rootPath || process.cwd(),
        templates: {
            index:    getValueOption(['-i', '--index'])     ?? DEFAULT_INDEX,
            notFound: getValueOption(['-n', '--not-found']) ?? DEFAULT_ERROR_404,
        }
    };
}

function printHelp() {
    console.log(`
        Usage: static-server [options] <root-path>

        Options:
          -p, --port <n>               the port to listen to for incoming HTTP connections (default: ${DEFAULT_PORT})
          -i, --index <filename>       the default index file if not specified (default: ${DEFAULT_INDEX})
          -f, --follow-symlink         follow links, otherwise fail with file not found
          -n, --not-found <filename>   the file not found template
          -c, --cors <pattern>         Cross Origin Pattern. Use "*" to allow all origins
          -z, --cache                  enable cache (http 304) responses (default: ${DEFAULT_CACHE})
          -l, --log-level              trace | info | warn | error (default: ${DEFAULT_LOG_LEVEL})
          -h, --help                   show this message
          -v, --version                show the version number
    `.replaceAll(/^ {8}/gm, '').trim());
    console.log();
}

function formatSize(sz) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

    for (let i = sizes.length - 1; i >= 0; --i) {
        const div = 1024 ** i;
        if (sz >= div) {
            const res = (sz / div).toFixed(2).replace(/\.?0+$/, '');
            return res + ' ' + sizes[i];
        }
    }

    return '0 B';
}

const styleCodes = {
    bold:       '1',
    faint:      '2',
    dim:        '2',       // alias for faint
    italic:     '3',
    underline:  '4',

    black:      '30',
    red:        '31',
    green:      '32',
    yellow:     '33',
    blue:       '34',
    magenta:    '35',
    cyan:       '36',
    white:      '37,',

    gray:       '90',

    bgBlack:    '40',
    bgRed:      '41',
    bgGreen:    '42',
    bgYellow:   '43',
    bgBlue:     '44',
    bgMagenta:  '45',
    bgCyan:     '46',
    bgWhite:    '47,',

    reset: '0',
    fgDefault: '39',
};

const fluentProps = Object.keys(styleCodes)
    .map(k => {
        return [k, {
            get() {
                function res(s) {
                    return chalk(res.styles, s);
                }

                res.styles = [ ... this.styles || [], k ];
                Object.defineProperties(res, fluentProps);

                return res;
            }
        }];
    })
    .reduce((acc, [k, v]) => (acc[k] = v, acc), {});


Object.defineProperties(chalk, fluentProps);
function chalk(styles, text) {
    const compiled = styles.map(x => styleCodes[x]).filter(x => !!x).join(';');
    return '\x1B[' + (compiled || styleCodes.fgDefault) + 'm' + text + '\x1B[0m';
}
