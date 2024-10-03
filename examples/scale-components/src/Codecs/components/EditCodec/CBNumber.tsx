import { useState, useEffect } from "react"
import { EditBigNumber } from "../../lib"
import { withDefault } from "../utils/default"
import { BinaryInput } from "./BinaryInput"

export const CBigNumber: EditBigNumber = ({
  numType,
  value,
  onValueChanged,
  encodedValue,
  onBinChanged,
}) => {
  const [localInput, setLocalInput] = useState<bigint | null>(
    withDefault(value, null),
  )
  const [isValid, setIsValid] = useState<{ valid: boolean; reason?: string }>({
    valid: true,
  })

  const sign = numType === "compactBn" ? "i" : numType.substring(0, 1)
  const size = numType === "compactBn" ? 64 : Number(numType.substring(1))

  const maxLen = sign === "i" ? 2 ** size / 2 - 1 : 2 ** size - 1
  const minLen = sign === "i" ? -(2 ** size / 2) : 0

  useEffect(() => {
    if (localInput === null)
      setIsValid({ valid: false, reason: "Please enter a value" })
    else if (localInput > maxLen)
      setIsValid({ valid: false, reason: "Too high. Max is " + maxLen })
    else if (localInput < minLen)
      setIsValid({ valid: false, reason: "Too low. Min is " + minLen })
    else setIsValid({ valid: true })
  }, [localInput, numType])

  return (
    <div>
      <div className="mr-2">
        <div className="flex flex-row bg-gray-700 rounded p-2 gap-2 items-center px-2 w-fit">
          <span className="text-sm text-gray-400">{numType}</span>
          <input
            className="bg-gray-700 border-none hover:border-none outline-none text-right max-w-32 w-fit"
            value={localInput === null ? "" : localInput.toString()}
            onChange={(evt) => {
              try {
                if (evt.target.value === "") {
                  setLocalInput(null)
                  setIsValid({ valid: false, reason: "Please enter a value" })
                } else {
                  let num = BigInt(evt.target.value)
                  setLocalInput(num)
                  if (num > maxLen)
                    setIsValid({
                      valid: false,
                      reason: "Too high. Max is " + maxLen,
                    })
                  else if (num < minLen)
                    setIsValid({
                      valid: false,
                      reason: "Too low. Min is " + minLen,
                    })
                  else {
                    setIsValid({ valid: true })
                    onValueChanged(num)
                  }
                }
              } catch (_) {
                return
              }
            }}
          />
        </div>
        {!isValid.valid && (
          <span className="text-red-600 text-sm">{isValid.reason}</span>
        )}
      </div>
    </div>
  )
}
