import type { Meta, StoryObj } from "@storybook/react"

import { Input } from "./Input"

const meta = {
  title: "Component/Input",
  component: Input,
  parameters: {
    // layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {},
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const AccountId: Story = {
  args: {
    label: "AccountId",
    value: {
      address: "5DX6YxwfzPugSxrZ84aTdqycAccLCVhUffroAnGT9yHyhUch",
      ss58Prefix: 0,
    },
    codec: "AccountId",
    input:
      "0x01590100004901415050524f56455f52464328303030352c3963626162666138303539386432393335383330633039633138653061306534656438323237623863386637343466316634613431643835393762623664343429",
    disabled: true,
  },
}

export const U16: Story = {
  args: {
    label: "number",
    value: 8417,
    codec: "u16",
    input:
      "0x01590100004901415050524f56455f52464328303030352c3963626162666138303539386432393335383330633039633138653061306534656438323237623863386637343466316634613431643835393762623664343429",
    disabled: true,
  },
}

export const CompactBn: Story = {
  args: {
    label: "compactBn",
    value: "4000000000000n",
    codec: "compactBn",
    input: "0x0b00409452a303",
    disabled: true,
  },
}

export const BytesArray: Story = {
  args: {
    label: "BytesArray",
    value: "0x01000000",
    codec: "BytesArray",
    len: 8,
    input:
      "0x01590100004901415050524f56455f52464328303030352c3963626162666138303539386432393335383330633039633138653061306534656438323237623863386637343466316634613431643835393762623664343429",
    disabled: true,
  },
}

export const Bytes: Story = {
  args: {
    label: "Bytes",
    value:
      "0x00004901415050524f56455f52464328303030352c3963626162666138303539386432393335383330633039633138653061306534656438323237623863386637343466316634613431643835393762623664343429",
    codec: "Bytes",
    input:
      "0x01590100004901415050524f56455f52464328303030352c3963626162666138303539386432393335383330633039633138653061306534656438323237623863386637343466316634613431643835393762623664343429",
    disabled: true,
  },
}

export const BitSequence: Story = {
  args: {
    label: "bitSequence",
    value: {
      bitsLen: "2",
      bytes: [2, 32, 56, 78, 90, 1, 8],
    },
    codec: "bitSequence",
    input:
      "0x01590100004901415050524f56455f52464328303030352c3963626162666138303539386432393335383330633039633138653061306534656438323237623863386637343466316634613431643835393762623664343429",
    disabled: true,
  },
}
