// Test-only stand-in for the official API. No YouTube playback/network is performed.
export const playerAPIMock = String.raw`
window.__playerMock = { calls: [], vars: {} };
window.YT = {
  Player: class {
    constructor(element, options) {
      this.options = options;
      this.position = 40;
      this.state = 5;
      this.frame = document.createElement('iframe');
      this.frame.src = 'https://www.youtube.com/embed/' + options.videoId + '?' + new URLSearchParams(options.playerVars);
      element.replaceWith(this.frame);
      window.__playerMock.vars = options.playerVars;
      queueMicrotask(() => options.events.onReady({ target: this }));
    }
    playVideo() { this.state = 1; this.record('play'); }
    pauseVideo() { this.state = 2; this.record('pause'); }
    seekTo(seconds) { this.position = seconds; this.record('seek', seconds); }
    record(command, value) {
      window.__playerMock.calls.push({ command, value });
      this.options.events.onStateChange({ target: this, data: this.state });
    }
    getCurrentTime() { return this.position; }
    getDuration() { return 240; }
    getPlayerState() { return this.state; }
    getIframe() { return this.frame; }
    destroy() { this.frame.remove(); window.__playerMock.calls.push({ command: 'destroy' }); }
  }
};
window.onYouTubeIframeAPIReady();
`;
