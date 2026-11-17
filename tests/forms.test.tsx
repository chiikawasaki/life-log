import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { EntryForm } from "../src/Forms";
import type { Data } from "../src/domain";
const data: Data = {
  statuses: [{ id: "s", name: "知識", display_order: 1 }],
  rules: [{ id: "r", name: "勉強", status_id: "s", archived_at: null }],
  versions: [
    {
      id: "v",
      rule_id: "r",
      unit: "分",
      required_quantity: 120,
      reward_points: 1,
      created_at: "2026-01-01",
    },
  ],
  entries: [],
};
it("時間と分をまとめて記録し、成功時のみ入力をクリアする", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<EntryForm data={data} busy={false} onSave={save} />);
  await user.type(screen.getByLabelText("時間"), "2");
  await user.type(screen.getByLabelText("分"), "30");
  await user.click(screen.getByRole("button", { name: "記録する" }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ quantity: 150 }));
  expect(screen.getByLabelText("時間")).toHaveValue(null);
});
it("保存失敗後は入力と同じ記録IDを保持する", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<EntryForm data={data} busy={false} onSave={save} />);
  await user.type(screen.getByLabelText("分"), "90");
  await user.click(screen.getByRole("button", { name: "記録する" }));
  expect(screen.getByLabelText("分")).toHaveValue(90);
  await user.click(screen.getByRole("button", { name: "記録する" }));
  expect(save.mock.calls[0][0].id).toBe(save.mock.calls[1][0].id);
});
it("保存待ちの連打を送信しない", async () => {
  let resolve!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  render(<EntryForm data={data} busy={false} onSave={save} />);
  fireEvent.change(screen.getByLabelText("分"), { target: { value: "120" } });
  const button = screen.getByRole("button", { name: "記録する" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(save).toHaveBeenCalledTimes(1);
  resolve();
});
it("ゼロの記録を送信しない", async () => {
  const save = vi.fn();
  render(<EntryForm data={data} busy={false} onSave={save} />);
  fireEvent.click(screen.getByRole("button", { name: "記録する" }));
  expect(screen.getByRole("alert")).toHaveTextContent("整数");
  expect(save).not.toHaveBeenCalled();
});
