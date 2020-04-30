export default {
    name: "animation",
    methods: {
        delayedBy: function() {
            return 250;
        },
        beforeEnter: function(el) {
            el.style.visibility = "hidden";
        },
        enterDefault: function(el, fx="zoomIn") {
            let delay = el.dataset.index * 150;
            
            setTimeout(function() {
                el.classList.add(fx);
                el.classList.add("animated");
                el.style.display = "";
            }, delay);
        },
        enter: function(el, fx="zoomIn") {
            let delay = el.dataset.index * this.delayedBy();
            
            if (el.dataset.index == 3) {
                fx = "zoomIn";
            }
            
            setTimeout(() => {
                el.classList.add(fx);
                el.classList.add("animated");
                el.style.visibility = "visible";
            }, delay);
        }
    }
};
