# MSFS AI Voice Guide

[简体中文](README.md) · [English](README.en.md)

**A geography lesson, somewhere over the clouds.**

Microsoft Flight Simulator 2024 is more than a cockpit: it is a globe you can fly around. Crossing an unfamiliar mountain range, coastline, or island, you may find yourself wondering: Where am I? What is this landscape called? What stories lie beneath the wings?

**MSFS AI Voice Guide** is an open-source AI tour guide for relaxed flights in MSFS 2024. It gives an AI assistant access to live simulator context and geographic information, so you can ask questions by voice or text while you enjoy the view. The guide can follow the current flight and recent conversation, so you do not have to explain your location every time. It is not a flight instructor and does not control the aircraft—it adds discovery and companionship to the journey.

<p align="center">
  <img src="docs/assets/readme/chat-window.png" alt="AI guide desktop chat window" width="260" />
</p>
<p align="center"><em>Talk with your AI guide by voice or text while flying.</em></p>

<table>
  <tr>
    <td align="center"><img src="docs/assets/readme/msfs-connection-check.png" alt="MSFS connection and component checks" width="360" /></td>
    <td align="center"><img src="docs/assets/readme/tool-toggles.png" alt="MSFS guide tool toggles" width="360" /></td>
  </tr>
  <tr>
    <td align="center"><em>Check simulator connectivity and runtime components</em></td>
    <td align="center"><em>Choose which flight-context tools are enabled</em></td>
  </tr>
</table>

## What you can do in flight

- **Ask questions naturally:** Use push-to-talk, continuous voice conversation, or text. Ask about your location, nearby landscapes, nature, or local culture, and interrupt spoken answers when you like.
- **Find out where you are:** Read the aircraft's live position from MSFS and combine it with geographic context from the Geo API, including country, administrative region, city, landforms, and available nearby points of interest.
- **Get flight context:** Ask about read-only flight data, in-game weather and time, the EFB route, the next waypoint, and nearby aviation facilities—without manually transcribing cockpit information.
- **Explore what you see:** Start an exploration around your current location and conversation, then follow topic introductions, suggested questions, and web sources to learn more about the scenery below.
- **Keep a lightweight desktop companion:** The Windows floating app shows simulator connection status and provides voice/text chat, service settings, tool toggles, and source browsing without taking over the flight experience.

## How it works

The desktop app connects to a local LiveKit service and AI Agent. The native MSFS CLI reads simulator data through SimConnect and related interfaces. When geographic interpretation is needed, the CLI calls the Geo API; the AI combines that context with the conversation to produce an answer. Simulator data and external geographic information have explicit source boundaries: external place names and landforms are not presented as native simulator data, and unavailable Geo API results are not fabricated.

The project can connect to DeepSeek, Volcengine speech services, and either Volcengine or Bocha web search. Some features require users to configure their own service accounts and credentials. See the Chinese [local setup instructions](README.md#本地运行) for current prerequisites and configuration details. The Windows x64 installer is currently a candidate build; code signing and automatic updates are not yet implemented.

> **Unofficial project:** This is an independent community project and is not affiliated with, authorized, sponsored, or endorsed by Microsoft Corporation or Asobo Studio. Microsoft Flight Simulator is a trademark of Microsoft Corporation.

## Join the community

Join the QQ group to ask questions, report issues, and share your flight experiences.

<p align="center">
  <img src="docs/assets/readme/community-qq.png" alt="MSFS AI Voice Guide QQ community poster" width="340" />
</p>

## License

Original project code is licensed under the [Apache License 2.0](LICENSE). Third-party dependencies, SDK-derived files, audio samples, and datasets remain subject to their respective licenses and terms; the project license does not grant additional rights to those assets.
