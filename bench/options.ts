/**
 * How long each measurement runs for.
 *
 * The defaults give tighter error bars than these, and a whole sweep that takes
 * twenty-five minutes — long enough that nobody runs it, which is worse for the
 * numbers than a percent of noise. At a fifth of a second per task the sweep is a
 * few minutes and the relative error stays inside a few percent, which is the
 * resolution the questions here need: "within sight of native?" and "did the
 * budget stop the walk?" are not close calls.
 *
 * Pass a longer `time` on the command line if you are chasing a small regression.
 */
export const RUN = { time: 200, warmupTime: 50 } as const;
