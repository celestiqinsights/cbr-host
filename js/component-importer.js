$(document).ready(function () {
  $("#header").load("components/header.html");
  $("#footer").load("components/footer.html");
  $("#category-nav").load("components/category-nav.html");
  $('#brands-slider').load("components/brands-slider.html");

  $('.nice-select').niceSelect();
});
