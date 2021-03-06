import React, {Fragment} from "react"
import ScrollDetect from "../../reader/scroll/detect"
import ScriptLoader from "../script-loader"
import "./render.css"
import {Tag, TagBlock, TagBlockInline} from "./tag/tag"

const Render = (tokens, renderState, debug) => {
  const toDisplay = []
  const append = (Component) => {
    toDisplay.push(<Fragment key={toDisplay.length + 1}>{Component}</Fragment>)
  }

  let betweenText = []

  tokens.forEach(token => {
    switch (token.type) {
      case ";": // comment
        // console.log(token.text) // ignore comments in general
        break
      case "t": // text
        renderState = RenderChunk(betweenText, renderState, append, debug)
        betweenText = []
        append(<span>{token.text}</span>)
        break
      case "*": // link
        betweenText.push(token)
        break
      case "@": // full-line tag
      case "[": // inline tag
        if (token.command.toLowerCase() === "align") {
          renderState = RenderChunk(betweenText, renderState, append, debug)
          betweenText = []
          append(<div style={{textAlign: "center"}}>{token.args.text}</div>)
        } else {
          betweenText.push(token)
        }
        break
      case "EOF":
        renderState = RenderChunk(betweenText, renderState, append, debug)
        betweenText = []
        // append(<div>--- end of {token.storage} ---</div>)
        break
      case "call": // jump or call statements require more page loading
        renderState = RenderChunk(betweenText, renderState, append, debug)
        betweenText = []
        toDisplay.push(
          <ScriptLoader key={"s"}
                        renderState={renderState}
                        gameState={token.gameState}
                        storage={token.storage}
                        target={token.target}/>)
        break
      default:
        console.log("warning: unhandled token type: " + token.type, token)
    }
  })
  return toDisplay
}

const RenderChunk = (tokens, renderState, append, debug) => {
  renderState = renderState === undefined ? {
    bgm: undefined, animationFrame: [], sectionID: 0, buildingSavePoints: [], savePoints: [],
  } : renderState

  const verbose = debug === 2

  let sectionID = renderState.sectionID

  let isDivider = false

  let time = 0
  let endTime = 0

  let layers = renderState.animationFrame


  let {buildingSavePoints, savePoints} = renderState

  const lastFrame = (layer) => {
    layer = layer === "base" ? 0 : (layer || 0)
    const animation = layers[layer] || []
    return animation[animation.length - 1]
  }
  // retrieve the layer contents generated by the last animation
  const lastContents = (layer) => {
    layer = layer === "base" ? 0 : (layer || 0)
    return (lastFrame(layer) || {}).contents || {folder: "bgimage/", image: "black"}
  }

  const pushFrame = (layer, frame) => {
    isDivider = true
    layer = layer === "base" ? 0 : (layer || 0)
    layers[layer] = layers[layer] || []
    layers[layer].push(frame)
  }

  const duplicateLastFrame = (layer, overrides) => {
    layer = layer === "base" ? 0 : (layer || 0)
    let frame = lastFrame(layer) || {contents: {folder: "bgimage/", image: "black"}, top: 0, left: 0}
    frame = Object.assign({}, frame, {time: time}, overrides || {})
    pushFrame(layer, frame)
  }

  const clearOtherLayers = (layer, timeOffset) => {
    layer = layer === "base" ? 0 : (layer || 0)
    timeOffset = timeOffset ? parseInt(timeOffset, 10) : 0
    // there must be a cleaner way to indicate that a layer has been removed
    layers.forEach((animation, animLayer) => {
      if (animation !== layers[layer]) {
        if (lastContents(animLayer).image) {
          // duplicateLastFrame(animLayer, {
          //   time: time,
          // })
          // duplicateLastFrame(animLayer, {
          //   time: time,
          //   opacity: 0,
          // })
          animation.push({
            contents: {},
            time: time,
          })
        }
      }
    })
  }

  const pushBasicFrame = (token, folder, image, layer, timeOffset, fadeInsteadOfAnimate) => {
    const pos = token.args.pos
    // these value can be defined in Config.tjs
    const position = pos === "l" || pos === "left" ? 25 : (pos === "left_center" || pos === "leftcenter" || pos === "lc" ? 37.5 : (pos === "c" || pos === "center" ? 50 : (pos === "right_center" || pos === "rightcenter" || pos === "rc" ? 62.5 : (pos === "right" || pos === "r" ? 75 : 0))))
    pushFrame(layer, {
      time: time + (timeOffset ? parseInt(timeOffset, 10) : 0),
      contents: {
        image: image && image.toLowerCase(),
        folder: folder,
        key: fadeInsteadOfAnimate === !lastContents(layer).key,
        transform: [token.args.fliplr ? "scaleX(-1)" : "", token.args.flipud ? "scaleY(-1)" : "", pos ? "translateX(-50%)" : ""].join(" ") || undefined,
      },
      left: token.args.left ? parseInt(token.args.left, 10) : (pos ? position * 8 : 0),
      top: token.args.top ? parseInt(token.args.top, 10) : (pos ? undefined : 0),
      bottom: pos ? 0 : undefined,
      opacity: (token.args.opacity ? parseInt(token.args.opacity, 10) : 255) / 255,
    })
  }

  let bgmTimeline = [{time: 0, bgm: renderState.bgm}]
  const pushBgm = (bgm, fadeTime) => {
    isDivider = true
    fadeTime = parseInt(fadeTime || 0, 10)
    const lastBgm = bgmTimeline[bgmTimeline.length - 1]
    if (lastBgm.time !== time) { // if time has advanced, create a new frame
      bgmTimeline.push({time: time, bgm: bgm, fadeTime: fadeTime})
    } else { // else change info of last frame
      lastBgm.bgm = bgm
      lastBgm.fadeTime = fadeTime
    }
  }

  let seTimeline = []
  const pushSound = (sound) => {
    isDivider = true
    if (seTimeline.length === 0 || seTimeline[seTimeline.length - 1].time !== time) {
      seTimeline.push({time: time, sounds: {}})
    }
    seTimeline[seTimeline.length - 1].sounds[sound] = true
  }

  let specialTokens = {}
  tokens.forEach((token, tokenIndex) => {
    if (token.type === "@" || token.type === "[") {
      let specialTag = "lightyellow"
      switch (token.command.toLowerCase()) {
        case "say":
          pushSound("voice/" + token.args.storage)
          break
        case "playbgm":
        case "fadeinbgm":
          pushBgm(token.args.storage, token.args.time)
          break
        case "stopbgm":
        case "fadeoutbgm":
          pushBgm(undefined, token.args.time)
          break
        case "fadeinse":
        case "playse":
          // TODO: handle looping
          pushSound("sound/" + token.args.storage)
          break
        case "stopse":
        case "fadeoutse":
          break // TODO: cancel looped sound effects
        case "dash":
        case "dashcombo": // these use opacity values where 0 is fully visible
        case "dashcombot": // imag = initial_mag?, mag = scale, fliplr, cx, cy,
          if (token.args.layer && token.args.layer.startsWith("&")) {
            break
          }

          let cx = token.args.cx === "c" ? "400" : token.args.cx || "0"
          let cy = token.args.cy === "c" ? "300" : token.args.cy || "0"

          let fOrigT = "translate(" + (cx ? parseInt(cx, 10) / 8 - 50 + "%" : "50%") + "," + (cy ? parseInt(cy, 10) / 6 - 50 + "%" : "50%") + ")"
          let rOrigT = "translate(" + (cx ? -parseInt(cx, 10) / 8 + 50 + "%" : "50%") + "," + (cy ? -parseInt(cy, 10) / 6 + 50 + "%" : "50%") + ")"

          pushFrame(token.args.layer, {
            time: time,
            contents: {
              image: token.args.storage && token.args.storage.toLowerCase(),
              folder: "bgimage/",
              key: !lastContents(token.args.layer).key,
              transform: [token.args.fliplr ? "scaleX(-1)" : "", token.args.flipud ? "scaleY(-1)" : ""].join(" ") || undefined,
            },
            transform: fOrigT + " scale(" + (token.args.imag ? token.args.imag : 1) + ") " + rOrigT,
            acceleration: token.args.accel || 0,
            left: 0,
            top: 0,
            opacity: 1, // (token.args.opacity ? (255 - parseInt(token.args.opacity, 10)) : 0) / 255,
          })

          time += parseInt(token.args.time, 10) || 0
          duplicateLastFrame(token.args.layer, {
            transform: fOrigT + " scale(" + (token.args.mag ? token.args.mag : 2) + ") " + rOrigT,
          })
          break
        case "imageex":
          pushBasicFrame(token, "bgimage/", token.args.storage, token.args.layer || 10, 0, true)
          break
        case "image":
        case "image4demo":
          if (token.args.layer && token.args.layer.startsWith("&")) {
            break
          }
          pushBasicFrame(token, "bgimage/", token.args.storage, token.args.layer, 0, true)
          break
        case "fadein":
        case "bg":
          if (token.args.layer && token.args.layer.startsWith("&")) {
            break
          }
          duplicateLastFrame(token.args.layer)
          pushBasicFrame(token, "bgimage/", token.args.file || token.args.storage, token.args.layer, token.args.time, true)
          clearOtherLayers(token.args.layer, token.args.time)

          time += (token.args.time ? parseInt(token.args.time, 10) : 0)
          break
        case "move":
          if (token.args.layer && token.args.layer.startsWith("&")) {
            break
          }
          duplicateLastFrame(token.args.layer)

          let nodes = []
          const pathRegex = /\((-?\d+),(-?\d+),(-?\d+)\)/y // read as many as we have
          let node
          while ((node = pathRegex.exec(token.args.path)) !== null) {
            nodes.push(node)
          }

          let moveTime = parseInt(token.args.time, 10)
          nodes.forEach((node, nodeID) => {
            duplicateLastFrame(token.args.layer, {
              time: time + moveTime * (1 + nodeID),
              left: parseInt(node[1], 10),
              top: parseInt(node[2], 10),
              opacity: parseInt(node[3], 10) / 255,
              acceleration: token.args.accel || 0,
            })
          })

          moveTime += time * nodes.length
          endTime = endTime > moveTime ? endTime : moveTime
          break
        case "wm":
          time = time > endTime ? time : endTime
          break
        case "wait":
          time += parseInt(token.args.time, 10) || 0
          break
        default:
          specialTag = false
      }
      if (debug && specialTag) {
        specialTokens[tokenIndex] = specialTag
      }
    }
  })

  if (isDivider) {
    const isNewSavePoint = buildingSavePoints.length !== 0
    savePoints = isNewSavePoint ? buildingSavePoints : savePoints
    buildingSavePoints = []

    append(<ScrollDetect key={"s" + ++sectionID}
                         id={sectionID}
                         savePoints={savePoints}
                         isSavePointOwner={isNewSavePoint}
                         timeline={layers}
                         bgmTimeline={bgmTimeline}
                         seTimeline={seTimeline}/>)
  }

  let tags = []
  let toRender = []
  tokens.forEach((token, tokenIndex) => {
    let render
    let specialTag = "pink"
    switch (token.type) {
      case "@": // full-line tag
      case "[": // inline tag
        switch (token.command.toLowerCase()) {
          case "r":
            specialTag = false
            if (!isDivider) {
              specialTag = "salmon"
              render = (<br/>)
            }
            break
          case "cm":
            specialTag = false
            if (!isDivider) {
              specialTag = "salmon"
              render = (<><br/><br/><br/></>)
            }
            break
          case "macro":
            specialTag = false
            // on creation of a macro, there's nothing to render unless debugging
            if (verbose) {
              tags.push(<div style={{color: "darkred", marginLeft: "2em", border: "1px solid green"}}>
                {token.tokens.map((token, index) => (<Tag key={index} command={token}/>))}
              </div>)
            }
            break
          case "return":
            specialTag = false
            // render = <div>--- returning from {token.from} (to {token.to}) ---</div>)
            break
          case "s":
            specialTag = false
            render = ("--- page generation halted at [s] ---")
            break
          default:
            specialTag = false
        }
        break
      case ";": // comment
        specialTag = false
        // console.log(token.text) // ignore comments in general
        break
      case "*": // link
        if (sectionID > 1) {
          buildingSavePoints.push(token.id.split("|")[0])
        }
        break
      default:
        specialTag = false
        console.log("warning: unhandled token type: " + token.type, token)
    }
    if (debug && (specialTag || specialTokens[tokenIndex] || verbose)) {
      tags.push(<Tag command={token} color={specialTag || specialTokens[tokenIndex]}/>)
      if (isDivider) {
        if (render) {
          toRender.push(render)
        }
      } else {
        if (render) {
          append(<TagBlockInline tags={tags}/>)
          tags = []
          append(render)
        }
      }
    } else {
      append(render)
    }
  })


  if (tags.length !== 0) {
    if (isDivider) {
      append(<TagBlock tags={tags}/>)
    } else {
      append(<TagBlockInline tags={tags}/>)
    }
  }

  toRender.forEach(append)

  // save final frame for next animation block to use
  let lastFrames = []
  layers.forEach((animation, layer) => {
    lastFrames[layer] = [Object.assign({}, animation[animation.length - 1], {time: 0})]
  })

  return {
    animationFrame: lastFrames,
    bgm: bgmTimeline[bgmTimeline.length - 1].bgm,
    sectionID: sectionID,
    buildingSavePoints: buildingSavePoints,
    savePoints: savePoints,
  }
}

export default Render
