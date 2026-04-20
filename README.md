## Installation

```
npm install --save-dev @diram1x/ymtm
```

## Build Outputs

| Client                                           | Build Command          | Formats         |
| ------------------------------------------------ | ---------------------- | --------------- |
| **[Next Music](https://nextmusic.diram1x.ru/)**  | `ymtm build nextmusic` | `.tar.gz`       |
| **[PulseSync](https://pulsesync.dev/)**          | `ymtm build pulsesync` | `.zip`, `.pext` |
| **[Yandex Music Web](https://music.yandex.ru/)** | `ymtm build web`       | `.user.js`      |

### Naming

```id="b9r9fi"
${theme.name}_${theme.version}_${build.package}.ext
```

- `theme.name` — theme name
- `theme.version` — version
- `build.package` — target

### Web Features

- **icon** — Tampermonkey icon
- **onefile** — bundles into a single `.user.js`
- **replaceLink**:
  - `from` → embeds asset into CSS
  - `from` + `to` → replaces URL

### Output Example

```id="9rpqdb"
dist/
├── Example-Theme_1.0.0_nm.tar.gz
├── Example-Theme_1.0.0_ps.zip
├── Example-Theme_1.0.0_ps.pext
└── Example-Theme_1.0.0_web.user.js
```

### package.json Example

```
{
    "name": "example-theme",
    "addonName" "Example Theme!",
    "version": "1.0.0",
    "description": "Example description",
    "author": "Your name",
    "license": "Your Project License",
    "scripts": {
        "build": "ymtm build",
        "build:nextmusic": "ymtm build nextmusic",
        "build:pulsesync": "ymtm build pulsesync",
        "build:web": "ymtm build web"
    },
    "build": {
        "targets": [
            "nextmusic",
            "pulsesync",
            "web"
        ]
    },
    "nextmusic": {
        "tarGz": {
            "artifactName": "Example-Theme_${theme.version}_${build.package}.tar.gz"
        }
    },
    "pulsesync": {
        "zip": {
            "artifactName": "Example-Theme_${theme.version}_${build.package}.zip"
        },
        "pext": {
            "artifactName": "Example-Theme_${theme.version}_${build.package}.pext"
        }
    },
    "web": {
        "icon": "https://url/to/icon.ext",
        "onefile": {
            "artifactName": "Example-Theme_${theme.version}_${build.package}.user.js"
        },
        "replaceLink": [
            {
                "from": "http://127.0.0.1:2007/assets/vibe.jpg?name=Example Theme!" // Embeds asset into CSS
            },
            {
                "from": "http://127.0.0.1:2007/assets/uzi.png?name=Example Theme!",             // Replaces
                "to": "https://github.com/Diramix/Diramix/blob/main/assets/banner.png?raw=true" // URL
            }
        ]
    },
    "devDependencies": {
        "@diram1x/ymtm": "^2.2.0"
        "esbuild": "^0.27.4"
    }
}
```

## Dependencies

- esbuild — used for building and minifying code
