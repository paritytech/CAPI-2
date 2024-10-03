import { EditStruct } from "../../../lib"

export const CStruct: EditStruct = ({ innerComponents, shape }) => {
  return (
    <div className="flex flex-col text-left">
      {Object.entries(innerComponents).map(([key, jsx]) => {
        const innerShape = shape.value[key].type
        const isComplex =
          innerShape === "struct" ||
          innerShape === "sequence" ||
          innerShape === "array" ||
          innerShape === "enum"

        return (
          <div key={key} className="mb-2">
            <span className="hover:text-pink-400 cursor-pointer">|--{key}</span>
            <div className="ml-[30px]">{isComplex && jsx}</div>
          </div>
        )
      })}
    </div>
  )
}
