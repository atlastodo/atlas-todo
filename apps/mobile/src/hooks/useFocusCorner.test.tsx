import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook } from "@testing-library/react-native";
import { useFocusCorner } from "./useFocusCorner";

/**
 * A storage promise nobody handles surfaces as an unhandled rejection, which the crash reporter
 * files as a crash. This hands the hook a rejection that records whether anything handled it.
 */
function watchedRejection(): { promise: Promise<never>; handled: () => boolean } {
  const promise = Promise.reject(new Error("storage unavailable"));
  let handled = false;
  const then = promise.then.bind(promise);
  Object.assign(promise, {
    then: (onFulfilled?: unknown, onRejected?: unknown) => {
      if (onRejected) handled = true;
      return then(onFulfilled as never, onRejected as never);
    },
    catch: (onRejected: unknown) => {
      handled = true;
      return then(undefined, onRejected as never);
    },
  });
  return { promise, handled: () => handled };
}

describe("useFocusCorner", () => {
  it("handles a storage failure when reading the corner", async () => {
    const failure = watchedRejection();
    jest.spyOn(AsyncStorage, "getItem").mockReturnValueOnce(failure.promise);

    const { result } = await renderHook(() => useFocusCorner());
    await act(async () => {});

    expect(failure.handled()).toBe(true);
    expect(result.current.corner).toBeTruthy();
  });

  it("handles a storage failure when remembering the corner", async () => {
    const { result } = await renderHook(() => useFocusCorner());
    await act(async () => {});
    const failure = watchedRejection();
    jest.spyOn(AsyncStorage, "setItem").mockReturnValueOnce(failure.promise);

    await act(() => result.current.setCorner("top-left"));

    expect(failure.handled()).toBe(true);
    expect(result.current.corner).toBe("top-left");
  });
});
