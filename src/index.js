function recycleElement(element, map) {
  return {
    nodeName: element.nodeName.toLowerCase(),
    attributes: {},
    children: map.call(element.childNodes, function(element) {
      return element.nodeType === 3 // Node.TEXT_NODE
        ? element.nodeValue
        : recycleElement(element, map)
    })
  }
}

function clone(target, source) {
  var obj = {}

  for (var i in target) obj[i] = target[i]
  for (var i in source) obj[i] = source[i]

  return obj
}

function getKey(node) {
  return node ? node.key : null
}

function eventListener(event) {
  return event.target.events[event.type](event)
}

function updateAttribute(element, name, value, oldValue, isSVG) {
  if (name === "key") {
  } else if (name === "style") {
    for (var i in clone(oldValue, value)) {
      element[name][i] = value == null || value[i] == null ? "" : value[i]
    }
  } else {
    if (name[0] === "o" && name[1] === "n") {
      if (!element.events) {
        element.events = {}
      }
      element.events[(name = name.slice(2))] = value
      if (value) {
        if (!oldValue) {
          element.addEventListener(name, eventListener)
        }
      } else {
        element.removeEventListener(name, eventListener)
      }
    } else if (name in element && name !== "list" && !isSVG) {
      element[name] = value == null ? "" : value
    } else if (value != null && value !== false) {
      element.setAttribute(name, value)
    }

    if (value == null || value === false) {
      element.removeAttribute(name)
    }
  }
}

function createElement(node, lifecycle, isSVG) {
  var element =
    typeof node === "string" || typeof node === "number"
      ? document.createTextNode(node)
      : (isSVG = isSVG || node.nodeName === "svg")
        ? document.createElementNS("http://www.w3.org/2000/svg", node.nodeName)
        : document.createElement(node.nodeName)

  var attributes = node.attributes
  if (attributes) {
    if (attributes.oncreate) {
      lifecycle.push(function() {
        attributes.oncreate(element)
      })
    }

    for (var i = 0; i < node.children.length; i++) {
      element.appendChild(createElement(node.children[i], lifecycle, isSVG))
    }

    for (var name in attributes) {
      updateAttribute(element, name, attributes[name], null, isSVG)
    }
  }

  return element
}

function updateElement(
  element,
  oldAttributes,
  attributes,
  lifecycle,
  isRecycling,
  isSVG
) {
  for (var name in clone(oldAttributes, attributes)) {
    if (
      attributes[name] !==
      (name === "value" || name === "checked"
        ? element[name]
        : oldAttributes[name])
    ) {
      updateAttribute(
        element,
        name,
        attributes[name],
        oldAttributes[name],
        isSVG
      )
    }
  }

  var cb = isRecycling ? attributes.oncreate : attributes.onupdate
  if (cb) {
    lifecycle.push(function() {
      cb(element, oldAttributes)
    })
  }
}

function removeChildren(element, node) {
  var attributes = node.attributes
  if (attributes) {
    for (var i = 0; i < node.children.length; i++) {
      removeChildren(element.childNodes[i], node.children[i])
    }

    if (attributes.ondestroy) {
      attributes.ondestroy(element)
    }
  }
  return element
}

function removeElement(parent, element, node) {
  function done() {
    parent.removeChild(removeChildren(element, node))
  }

  var cb = node.attributes && node.attributes.onremove
  if (cb) {
    cb(element, done)
  } else {
    done()
  }
}

function patchElement(
  parent,
  element,
  oldNode,
  node,
  lifecycle,
  isRecycling,
  isSVG
) {
  if (node === oldNode) {
  } else if (oldNode == null || oldNode.nodeName !== node.nodeName) {
    var newElement = createElement(node, lifecycle, isSVG)
    if (parent) {
      parent.insertBefore(newElement, element)
      if (oldNode != null) {
        removeElement(parent, element, oldNode)
      }
    }
    element = newElement
  } else if (oldNode.nodeName == null) {
    element.nodeValue = node
  } else {
    updateElement(
      element,
      oldNode.attributes,
      node.attributes,
      lifecycle,
      isRecycling,
      (isSVG = isSVG || node.nodeName === "svg")
    )

    var oldKeyed = {}
    var newKeyed = {}
    var oldElements = []
    var oldChildren = oldNode.children
    var children = node.children

    for (var i = 0; i < oldChildren.length; i++) {
      oldElements[i] = element.childNodes[i]

      var oldKey = getKey(oldChildren[i])
      if (oldKey != null) {
        oldKeyed[oldKey] = [oldElements[i], oldChildren[i]]
      }
    }

    var i = 0
    var k = 0

    while (k < children.length) {
      var oldKey = getKey(oldChildren[i])
      var newKey = getKey(children[k])

      if (newKeyed[oldKey]) {
        i++
        continue
      }

      if (newKey == null || isRecycling) {
        if (oldKey == null) {
          patchElement(
            element,
            oldElements[i],
            oldChildren[i],
            children[k],
            lifecycle,
            isRecycling,
            isSVG
          )
          k++
        }
        i++
      } else {
        var keyedNode = oldKeyed[newKey] || []

        if (oldKey === newKey) {
          patchElement(
            element,
            keyedNode[0],
            keyedNode[1],
            children[k],
            lifecycle,
            isRecycling,
            isSVG
          )
          i++
        } else if (keyedNode[0]) {
          patchElement(
            element,
            element.insertBefore(keyedNode[0], oldElements[i]),
            keyedNode[1],
            children[k],
            lifecycle,
            isRecycling,
            isSVG
          )
        } else {
          patchElement(
            element,
            oldElements[i],
            null,
            children[k],
            lifecycle,
            isRecycling,
            isSVG
          )
        }

        newKeyed[newKey] = children[k]
        k++
      }
    }

    while (i < oldChildren.length) {
      if (getKey(oldChildren[i]) == null) {
        removeElement(element, oldElements[i], oldChildren[i])
      }
      i++
    }

    for (var i in oldKeyed) {
      if (!newKeyed[i]) {
        removeElement(element, oldKeyed[i][0], oldKeyed[i][1])
      }
    }
  }
  return element
}

export function h(name, attributes) {
  var rest = []
  var children = []
  var length = arguments.length

  while (length-- > 2) rest.push(arguments[length])

  while (rest.length) {
    var node = rest.pop()
    if (node && node.pop) {
      for (length = node.length; length--; ) {
        rest.push(node[length])
      }
    } else if (node != null && node !== true && node !== false) {
      children.push(node)
    }
  }

  return typeof name === "function"
    ? name(attributes || {}, children) // h(Component)
    : {
        nodeName: name,
        attributes: attributes || {},
        children: children,
        key: attributes && attributes.key
      }
}

export function patch(node, element) {
  var lifecycle = []

  element = patchElement(
    element && element.parentNode,
    element,
    element &&
      (element.node == null ? recycleElement(element, [].map) : element.node),
    node,
    lifecycle,
    element && element.node == null // isRecycling
  )
  element.node = node

  while (lifecycle.length) lifecycle.pop()()

  return element
}
