import { clsx } from "clsx"
import { EditEnum, NOTIN } from "../../../lib"

export const CEnum: EditEnum = ({ value, inner, shape }) => {
  let shouldNest = false
  if (value !== NOTIN) {
    let innerShape = shape.value[value.type]
    let innerType

    if (innerShape.type === "lookupEntry") {
      innerType = innerShape.value.type
    } else {
      innerType = innerShape.type
    }
    shouldNest =
      innerType === "array" ||
      innerType === "sequence" ||
      innerType === "struct" ||
      innerType === "enum" ||
      innerType === "result"
  }
  console.log("IM here", value)

  if (value === NOTIN) return null

  return (
    <div
      className={clsx(
        "flex text-left gap-2 ml-0 items-start",
        shouldNest
          ? "flex-col border-l-[1px] border-dashed border-gray-500"
          : "flex-row",
      )}
    >
      <span>{value.type}</span>
      <div className={clsx(shouldNest && "ml-[30px]")}>{inner}</div>
    </div>
  )
}
