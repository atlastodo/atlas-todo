import type { ReactNode } from "react";
import { Platform } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { fakeAuth } from "../testutil";
import { AuthContext, type AuthContextValue } from "./AuthContext";
import { LoginScreen } from "./LoginScreen";

/**
 * Signing up with an admin's invite: the link opens the signup form with its code filled in (web),
 * and on a phone -- where no link carries it -- the code can be typed.
 */
function withAuth(value: Partial<AuthContextValue>) {
  const full = fakeAuth(value);
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AuthContext.Provider value={full}>{children}</AuthContext.Provider>;
  };
}

async function signUp() {
  await fireEvent.changeText(screen.getByLabelText("Name"), "Ada");
  await fireEvent.changeText(screen.getByLabelText("Email"), "ada@example.com");
  await fireEvent.changeText(screen.getByLabelText("Password"), "hunter2hunter");
  await fireEvent.press(screen.getByText("Create account"));
}

describe("LoginScreen invites", () => {
  it("takes a typed invite code on a phone", async () => {
    const signup = jest.fn(async () => {});
    await render(<LoginScreen />, { wrapper: withAuth({ signup }) });
    await fireEvent.press(screen.getByText("Need an account? Sign up"));

    await fireEvent.changeText(screen.getByLabelText("Invite code"), " code-123 ");
    await signUp();

    await waitFor(() =>
      expect(signup).toHaveBeenCalledWith("ada@example.com", "hunter2hunter", "Ada", "code-123"),
    );
  });

  describe("on the web", () => {
    const os = Platform.OS;
    const g = globalThis as { window?: { location?: { search: string } } };
    const hadWindow = "window" in g;
    const previous = g.window;

    beforeEach(() => {
      (Platform as { OS: string }).OS = "web";
      g.window = { ...(previous ?? {}), location: { search: "?invite=link-code" } } as never;
    });
    afterEach(() => {
      (Platform as { OS: string }).OS = os;
      if (hadWindow) g.window = previous;
      else delete g.window;
    });

    it("opens an invite link in signup mode with the code filled in", async () => {
      const signup = jest.fn(async () => {});
      await render(<LoginScreen />, { wrapper: withAuth({ signup }) });

      expect(screen.getByLabelText("Invite code").props.value).toBe("link-code");
      await signUp();

      await waitFor(() =>
        expect(signup).toHaveBeenCalledWith("ada@example.com", "hunter2hunter", "Ada", "link-code"),
      );
    });
  });
});
