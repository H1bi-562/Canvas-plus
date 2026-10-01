import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test } from "vitest";
import PasswordField from "../app/(auth)/login/_components/PasswordField";

test("password visibility is independent and retains the input value", () => {
  render(<><PasswordField aria-label="First" defaultValue="secret-one" /><PasswordField aria-label="Second" defaultValue="secret-two" /></>);
  const first = screen.getByLabelText("First") as HTMLInputElement;
  const second = screen.getByLabelText("Second") as HTMLInputElement;
  expect(first.type).toBe("password");
  fireEvent.click(screen.getAllByRole("button", { name: "Show password" })[0]);
  expect(first.type).toBe("text");
  expect(second.type).toBe("password");
  expect(first.value).toBe("secret-one");
  fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
  expect(first.type).toBe("password");
});
