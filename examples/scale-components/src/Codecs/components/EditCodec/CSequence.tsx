import { useState } from "react"
import { EditSequence, NOTIN } from "../../lib"

export const CSequence: EditSequence = ({
  innerComponents,
  value,
  onValueChanged,
}) => {
  const [inDrag, setInDrag] = useState<number | null>(null)
  const addItem = () => {
    const curr = value !== NOTIN ? value.slice() : []

    curr.push(NOTIN)
    onValueChanged([...curr])
  }

  const removeItem = (idx: number) => {
    const curr = value !== NOTIN ? value.slice() : []
    curr.splice(idx, 1)
    onValueChanged([...curr])
  }

  const handleDragStart = (idx: number) => {
    setInDrag(idx)
  }

  const handleDragEnter = (idx: number) => {
    const newList = value === NOTIN ? [] : [...value]
    const draggedElement = newList[inDrag!]

    newList.splice(inDrag!, 1)
    newList.splice(idx, 0, draggedElement)

    setInDrag(idx)
    onValueChanged(newList)
  }

  const handleDragEnd = () => {
    setInDrag(null)
  }

  return (
    <ul className="text-gray-50">
      {innerComponents.map((item, idx) => (
        <li
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragEnter={() => handleDragEnter(idx)}
          onDragEnd={handleDragEnd}
        >
          <div
            key={idx}
            className="flex flex-col border-[1px] border-dashed my-1"
          >
            <div className="flex flex-row gap-2 items-center">
              <span>Item {idx + 1}</span>
              <button
                className="border-[1px] rounded p-1 text-red-600"
                onClick={() => removeItem(idx)}
              >
                delete
              </button>
            </div>
            {item}
          </div>
        </li>
      ))}
      <button className="border-[1px] rounded p-1" onClick={addItem}>
        + Add new item
      </button>
    </ul>
  )
}

const DraggableList = () => {}
