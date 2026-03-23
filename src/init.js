const fs = require('fs');
const path = require('path');
const log = require('./logger');

const DEFAULT_METADATA = {
  name:        'theme',
  author:      ['developer'],
  description: 'Hello, World!',
  type:        'theme',
  version:     '1.0.0',
  css:         'style.css',
  script:      'script.js',
};

const DEFAULT_PKG = {
  name:        'my-theme',
  themeName:   'My Theme',
  version:     '1.0.0',
  description: 'Hello, World!',
  author:      'developer',
  license:     'MIT',
  scripts: {
    build:            'ymtm build',
    'build:pulsesync':'ymtm build pulsesync',
    'build:nextmusic': 'ymtm build nextmusic',
    'build:web':       'ymtm build web',
  },
  build: {
    package: ['nextmusic', 'pulsesync', 'web'],
  },
  nextmusic: {
    zip: { artifactName: '${theme.name}_${theme.version}_nm.zip' },
  },
  pulsesync: {
    zip:  { artifactName: '${theme.name}_${theme.version}_ps.zip' },
    pext: { artifactName: '${theme.name}_${theme.version}_ps.pext' },
  },
  web: {
    zip: { artifactName: '${theme.name}_${theme.version}_web.zip' },
  },
  devDependencies: {
    ymtm: 'github:your-username/ymtm',
  },
};

function init(cwd = process.cwd()) {
  const themeName  = DEFAULT_METADATA.name;
  const themeDir   = path.join(cwd, themeName);
  const pkgPath    = path.join(cwd, 'package.json');

  log.task('init');

  // package.json
  if (fs.existsSync(pkgPath)) {
    log.warn('package.json already exists, skipping');
  } else {
    fs.writeFileSync(pkgPath, JSON.stringify(DEFAULT_PKG, null, 2), 'utf8');
    log.file('write', 'package.json');
  }

  // theme folder
  fs.mkdirSync(themeDir, { recursive: true });
  log.file('write', `${themeName}/`);

  // metadata.json
  const metaPath = path.join(themeDir, 'metadata.json');
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify(DEFAULT_METADATA, null, 2), 'utf8');
    log.file('write', `${themeName}/metadata.json`);
  }

  // style.css
  const cssPath = path.join(themeDir, 'style.css');
  if (!fs.existsSync(cssPath)) {
    fs.writeFileSync(cssPath, '{}', 'utf8');
    log.file('write', `${themeName}/style.css`);
  }

  // script.js
  const jsPath = path.join(themeDir, 'script.js');
  if (!fs.existsSync(jsPath)) {
    fs.writeFileSync(jsPath, '{}', 'utf8');
    log.file('write', `${themeName}/script.js`);
  }

  log.done('init');
}

module.exports = { init };
