const Tokenize = (tokens, gameState, stackFrame, target) => {
  if (target) {
    for (; stackFrame.lineIndex < stackFrame.lines.length; stackFrame.lineIndex++) {
      if (stackFrame.lines[stackFrame.lineIndex].startsWith(target)) {
        break
      }
    }
  }

  loop:
    for (; stackFrame.lineIndex < stackFrame.lines.length; stackFrame.lineIndex++) {
      let line = stackFrame.lines[stackFrame.lineIndex].trim()
      switch (line.charAt(0)) {
        case ";":
          tokens.push({type: ";", text: line})
          break
        case "*":
          // link
          tokens.push({type: "*", id: line})
          break
        case "@":
          // command
          const tag = ParseTag(line, 0)
          if (InterpretCommand(tokens, gameState, tag, stackFrame)) {
            break loop
          }
          break
        default:
          // regular text
          if (line.length !== 0) {
            if (ParseInlineTags(tokens, gameState, line, stackFrame)) {
              break loop
            }
          }
      }
    }

  if (stackFrame.lineIndex >= stackFrame.lines.length) {
    tokens.push({type: "EOF", storage: stackFrame.storage})
  }
}

const ignoreMacros = {cl_notrans: true}

// InterpretCommand interprets the given command, and pauses execution of the
const InterpretCommand = (tokens, gameState, tag, stackFrame) => {
  if (stackFrame.macroBuilder) { // if we're building a macro, just add commands to the macro
    const macroBuilder = stackFrame.macroBuilder
    if (tag.command === "endmacro") {
      tokens.push({type: "@", command: "macro", args: {name: macroBuilder.name}, tokens: macroBuilder.macro}) // for debug only, macros should be ignored in general
      gameState.macros[macroBuilder.name] = macroBuilder.macro
      stackFrame.macroBuilder = false
    } else {
      macroBuilder.macro.push(tag)
    }
    return false
  }

  if (tag.type === "t") {
    tokens.push(tag)
    return false
  }

  if (tag.command in gameState.macros) { // if a macro, run each command in the macro
    if (!(tag.command in ignoreMacros)) {
      tokens.push(tag)
      const macro = gameState.macros[tag.command]
      return macro.some(macroCommand => {
        let cmd = macroCommand
        if (macroCommand.type !== "t") {
          const args = Object.assign({}, macroCommand.args)
          // handle '%value' arguments
          Object.keys(args).forEach(key => {
            const value = args[key]
            if (typeof value === "string" && value.startsWith("%")) {
              args[key] = tag.args[value.substring(1)]
            }
          })
          // handle '*' argument
          if (macroCommand.args["*"]) {
            delete args["*"]
            Object.assign(args, tag.args)
          }

          cmd = {
            type: macroCommand.type,
            command: macroCommand.command,
            args: args,
            depth: (tag.depth || 0) + 1,
          }
        }
        return InterpretCommand(tokens, gameState, cmd, stackFrame)
      })
    }
  }

  switch (tag.command.toLowerCase()) {
    case "jump":
      tokens.push(tag)

      stackFrame.lineIndex++

      tokens.push({
        type: "call",
        gameState,
        storage: tag.args.storage || stackFrame.storage,
        target: tag.args.target,
      })
      return true
    case "call":
      tokens.push(tag)

      stackFrame.lineIndex++

      tokens.push({
        type: "call",
        gameState,
        storage: tag.args.storage || stackFrame.storage,
        target: tag.args.target,
        returnFrame: stackFrame,
      })
      return true
    case "return":
      if (stackFrame.returnFrame) {
        tokens.push(Object.assign({from: stackFrame.storage, to: stackFrame.returnFrame.storage}, tag))

        Tokenize(tokens, gameState, stackFrame.returnFrame)
      }
      return true
    case "iscript":
      // skip lines until end of script
      const script = []
      for (stackFrame.lineIndex++; stackFrame.lineIndex < stackFrame.lines.length; stackFrame.lineIndex++) {
        let line = stackFrame.lines[stackFrame.lineIndex]
        if (line === "[endscript]" || line === "@endscript") {
          break
        } else {
          script.push(line)
        }
      }
      tokens.push(Object.assign({script}, tag))
      break
    case "macro":
      // start building macro
      stackFrame.macroBuilder = {name: tag.args.name, macro: []}
      break
    case "erasemacro":
      tokens.push(tag)
      delete gameState.macros[tag.args.name]
      break
    case "s":
      tokens.push(tag)
      return true
    default:
      tokens.push(tag)
  }
  return false
}

const ParseTag = (tag, startAt) => {
  const tagRegex = /([@[])([^\s\]]+)/y
  const argsRegex = /\s*(?:([^\s=]+)=((?:'[^']*'|"[^"]*"|[^\s'"\]])+)|(\*))/y

  tagRegex.lastIndex = startAt
  let tagMatch = tagRegex.exec(tag)

  if (!tagMatch) {
    return {command: "unable to match: '" + tag + "'", args: {}, lastIndex: startAt}
  }

  let lastIndex = tagRegex.lastIndex
  argsRegex.lastIndex = tagRegex.lastIndex

  let args = {}
  let arg
  while ((arg = argsRegex.exec(tag)) !== null) {
    if (arg[3]) {
      args["*"] = true
    } else {
      if (arg[2].startsWith("\"")) {
        // can do better un-escaping of quoted strings, this is just a hack for basic (") enclosed strings
        arg[2] = arg[2].substring(1, arg[2].length - 1)
      }
      args[arg[1]] = arg[2]
    }
    lastIndex = argsRegex.lastIndex
  }

  return {type: tagMatch[1], command: tagMatch[2], args: args, lastIndex: lastIndex}
}

const ParseInlineTags = (tokens, gameState, line, stackFrame) => {
  const tagRegex = /([^[]*)(\[?)/y // read until there's a '[' character
  let tag
  while ((tag = tagRegex.exec(line)) !== null) {
    if (tag[1].length !== 0) {
      if (InterpretCommand(tokens, gameState, {type: "t", text: tag[1]}, stackFrame)) {
        return true
      }
    }
    if (tag[2]) { // if the last character was '['
      let command = ParseTag(line, tagRegex.lastIndex - 1)
      tagRegex.lastIndex = command.lastIndex + 1

      if (InterpretCommand(tokens, gameState, command, stackFrame)) {
        return true
      }
    } else {
      break
    }
  }
  return false
}

export default Tokenize