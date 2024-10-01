import { useLayoutEffect, useRef, useState } from "react"
import { EditStruct } from "../../../lib"

export const CStruct: EditStruct = ({ innerComponents, shape }) => {
  const [maxWidth, setMaxWidth] = useState(0)
  const contentRefs = useRef<(HTMLSpanElement | null)[]>([])

  useLayoutEffect(() => {
    const widths = contentRefs.current
      .map((ref) => ref?.scrollWidth)
      .filter((el) => el !== undefined)
    setMaxWidth(Math.max(...widths))
  }, [])

  return (
    <div className="flex flex-col text-left">
      {Object.entries(innerComponents).map(([key, jsx]) => {
        const innerShape = shape.value[key].type
        const isComplex = innerShape === "struct"

        return (
          <div className="mb-2">
            <span ref={(el) => (contentRefs.current[0] = el)}>|--{key}</span>
            <div>{isComplex && jsx}</div>
          </div>
        )
      })}
    </div>
  )
}
