## Installation

```
npm install github:Diramix/ymtm
```

You can specify a version during installation like this:
`github:Diramix/ymtm#1.2.0`

## Build Outputs

| Client                                                                | Build Command          | Formats         |
| --------------------------------------------------------------------- | ---------------------- | --------------- |
| **[Next Music](https://github.com/Web-Next-Music/Next-Music-Client)** | `ymtm build nextmusic` | `.zip`          |
| **[PulseSync](https://pulsesync.dev/)**                               | `ymtm build pulsesync` | `.zip`, `.pext` |
| **[Yandex Music Web](https://music.yandex.ru/)**                      | `ymtm build web`       | `.user.js`      |

### Naming

```id="b9r9fi"
${theme.name}_${theme.version}_${build.package}.ext
```

* `theme.name` — theme name
* `theme.version` — version
* `build.package` — target

### Web Features

* **icon** — Tampermonkey icon
* **onefile** — bundles into a single `.user.js`
* **replaceLink**:

  * `from` → embeds asset into CSS
  * `from` + `to` → replaces URL

### Output Example

```id="9rpqdb"
dist/
├── Example-Theme_1.0.0_nm.zip
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
        "package": [
            "nextmusic",
            "pulsesync",
            "web"
        ]
    },
    "nextmusic": {
        "zip": {
            "artifactName": "Example-Theme_${theme.version}_${build.package}.zip"
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
    "dependencies": {
        "ymtm": "github:Diramix/ymtm#1.2.0"
    },
    "devDependencies": {
        "esbuild": "^0.27.4"
    }
}
```

## Dependencies

* esbuild — used for building and minifying code
