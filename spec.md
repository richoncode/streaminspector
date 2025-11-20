# StreamInspector Specification

## Purpose
StreamInspector is a web app to view and manage stream configuration files. It displays details from JSON configs including video URLs, thumbnails, and masks.

## Data Structure
Configs are JSON arrays of sports with the following structure:
```json
[
  {
    "sport": "basketball",
    "games": [
      {
        "clips": [
          {
            "id": "1",
            "gid": "game_id",
            "strurl": "https://...m3u8",
            "thumbnailUrl": "https://...jpg",
            "maskUrl": "https://...png",
            "mediaType": "StereoVideo",
            "sportData": {...},
            "regData": {...}
          }
        ],
        "experience": "https://...json"
      }
    ]
  }
]
```

## Core Features (MVP)

### 1. Config List View
- Display a list of known stream configs (stored locally)
- Show: Filename, Sport, Number of clips
- Click to view details

### 2. Detail View
- **Video Info**: Stream URL (strurl), Media Type
- **Visual Assets**: Thumbnail image, Mask image
- **Metadata**: Game ID, Sport, Clip ID
- **Raw JSON**: Expandable view of full config

### 3. Config Management
- Add new config (URL or file upload)
- Remove config from list
- Refresh/Reload config

## Tech Stack
- React 19 + Vite
- Tailwind CSS
- LocalStorage (for MVP config list)

## User Flow
1. Home: List of configs
2. Click config → Detail view with video/thumbnail/mask
3. Action bar: Add/Remove configs
