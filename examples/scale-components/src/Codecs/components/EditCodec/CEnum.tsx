import { clsx } from "clsx"
import { EditEnum } from "../../lib"
import { NOTIN } from "../../lib"
import { useEffect } from "react"

export const CEnum: EditEnum = ({
  type,
  value,
  tags,
  inner,
  shape,
  onValueChanged,
  encodedValue,
}) => {
  console.log("type", type, encodedValue)
  let isComplex = false
  if (type !== "blank") {
    let innerShape = shape.value[value.type]
    let innerType

    if (innerShape.type === "lookupEntry") {
      innerType = innerShape.value.type
    } else {
      innerType = innerShape.type
    }
    isComplex =
      innerType === "array" ||
      innerType === "sequence" ||
      innerType === "struct" ||
      innerType === "enum" ||
      innerType === "result"
  }

  const disabled = false

  useEffect(() => {
    console.log("type", type)
    if (tags.length > 0 && type === "blank") {
      onValueChanged({ type: tags[0].tag, value: NOTIN })
    }
  }, [tags])
  return (
    <div className="flex flex-col">
      <div className={clsx("flex flex-row border-[1px] border-dashed my-2")}>
        <div>
          <select
            disabled={disabled}
            className={clsx(
              "w-fit bg-slate-700 p-2 rounded pr-8 border-r-4 border-slate-700",
              disabled && "appearance-none",
            )}
            onChange={(e) =>
              onValueChanged({ type: e.target.value, value: NOTIN })
            }
            value={value === NOTIN ? "" : value.type}
          >
            {tags.map(({ tag }) => (
              <option
                key={tag}
                value={tag}
                selected={value !== NOTIN && tag === value.type}
              >
                {tag}
              </option>
            ))}
          </select>
        </div>
        {!isComplex && inner}
      </div>
      {isComplex && inner}
    </div>
  )
}
