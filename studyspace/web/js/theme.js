// Runs before the page paints so there is no light/dark flash.
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('studyspace.theme');
    if (saved === 'dark' || saved === 'light') theme = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  } catch (e) { /* storage blocked: stay with light */ }
  document.documentElement.dataset.theme = theme;
})();
