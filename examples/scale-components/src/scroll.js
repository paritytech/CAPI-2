let listContainer
let treeWrapper
let tree
let windowHeight
let inViewHeight
let listScrollPos = 0
let treeScrollPos = 0
let inViewTop = 0
let map

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    init()
  }, 100)
})

function init() {
  listContainer = document.querySelector("#list-container")
  treeWrapper = document.querySelector("#tree-container").firstChild
  tree = treeWrapper.firstChild
  windowHeight = window.innerHeight
  console.log("scrolljs", listContainer, tree)
  createMap()
  setSize()
  window.addEventListener("resize", setSize)
  window.addEventListener("scroll", listScroll)
  listContainer.addEventListener("mouseover", highlightSection)
  tree.addEventListener("click", scrollToElement)
}

function highlightSection(e) {
  // console.log(e.target);
}

function scrollToElement(e) {
  const targetPos = e.target.offsetTop / tree.getBoundingClientRect().height
  console.log(e.target, e.target.offsetTop)
  window.scrollTo({
    top: targetPos * listContainer.getBoundingClientRect().height,
    left: 0,
    behavior: "smooth",
  })
}

function setSize() {
  windowHeight = window.innerHeight
  inViewHeight =
    (windowHeight / listContainer.getBoundingClientRect().height) * 100
  setMapPos()
}

function listScroll() {
  inViewTop =
    1 -
    (listContainer.getBoundingClientRect().top /
      listContainer.getBoundingClientRect().height) *
      100
  listScrollPos = window.scrollY / listContainer.getBoundingClientRect().height
  treeWrapper.scrollTop = listScrollPos * tree.getBoundingClientRect().height
  setMapPos()
}

function createMap() {
  map = document.createElement("div")
  map.setAttribute(
    "style",
    "width:100%; position:absolute; background-color:rgba(55, 65, 81, 0.2); z-index: -1; opacity: 1; left:0; top:0; pointer-events:none",
  )
  tree.append(map)
}

function setMapPos() {
  const mapHeight = (inViewHeight / 100) * tree.getBoundingClientRect().height
  map.style.opacity = mapHeight >= tree.getBoundingClientRect().height ? 0 : 1
  map.style.height = mapHeight + "px"
  map.style.transform =
    "translateY(" +
    (inViewTop / 100) * tree.getBoundingClientRect().height +
    "px)"
}
