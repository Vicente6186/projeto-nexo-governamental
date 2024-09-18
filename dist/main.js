(()=>{"use strict";var n={751:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,"#about {\n    width: 90%;\n    margin-inline: auto;\n    padding: 6.4rem;\n    background-color: white;\n    border-radius: 4.8rem;\n    color: var(--primary);\n    position: relative;\n    top: -4rem;\n\n    display: grid;\n    grid-template-columns: 2fr 1fr;\n    justify-items: center;\n    align-items: center;\n    gap: 6.4rem;\n\n    #about-list {\n        list-style-type: none;\n    }\n\n    #about-title {\n        margin-bottom: 1.6rem;\n        \n        img {\n            height: 4.8rem;\n            vertical-align: text-top;\n        }\n    }\n\n    #about-list-title {\n        margin-block: 4.8rem 1.6rem;\n    }\n\n    #about-video-title {\n        margin-bottom: 1.6rem;\n    }\n\n    #about-video-explication-container {\n        margin-top: 4.8rem;\n        display: flex;\n        gap: 1.6rem;\n        img {\n            width: 12rem;\n            object-fit: contain;\n        }\n    }\n\n    #about-video-container {\n        img {\n            position: absolute;\n            transform: translate(-20%, -20%);\n        }\n\n        video {\n            display: block;\n            width: 100%;\n            border: solid var(--primary) 1.6rem;\n            border-radius: 5.6rem;\n        }\n    }\n\n   \n}\n\n@media screen and (max-width: 992px) {\n    #about {\n        width: 100%;\n        padding: 3.2rem 1.6rem;\n        grid-template-columns: 1fr;\n\n        video {\n            max-width: 36rem;\n        }\n    }\n}\n",""]);const d=a},600:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,"#contact {\n    min-height: 100vh;\n    padding: 6.4rem 3.2rem;\n    \n    background: linear-gradient(to bottom, #04364A, #0A80B0);\n    background-attachment: fixed;\n    border-radius: 0px 0px 64px 64px;\n\n    .container {\n        display: grid;\n    grid-template-columns: repeat(auto-fit, minmax(min(100%, 40rem), 1fr));\n    align-items: center;\n    gap: 3.2rem;\n    }\n\n    #contact-content {\n        display: flex;\n        flex-direction: column;\n        align-items: center;\n\n        h2 {\n            margin-block: 4rem;\n            text-align: center;\n            img {\n                height: 4.8rem;\n                vertical-align: text-top;\n            }\n        }\n    \n        p {\n            padding: 1.6rem;\n            border: solid #ff6978 .4rem;\n            border-radius: 3.2rem;\n            color: #ff6978;\n            text-align: center;\n        }\n\n        #contact-icon {\n            max-width: 16rem;\n        }\n    }\n    \n    form {\n        color: var(--primary);\n        background-color: white;\n        padding: 3.2rem;\n        border-radius: 3.2rem;\n\n        display: flex;\n        flex-direction: column;\n        gap: 4.8rem;\n    }\n}\n\n@media screen and (max-width: 992px) {\n    #contact {\n        padding-inline: 1.6rem;\n    }\n}",""]);const d=a},671:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,"footer {\n    width: 90%;\n    margin-inline: auto;\n    padding: 3.2rem;\n    background-color: var(--dark-blue);\n    border-radius: 3.2rem 3.2rem 0 0;\n    position: relative;\n    margin-top: -2.4rem;\n\n   \n    ul {\n        margin-block: 1.8rem;\n        list-style: none;\n        display: flex;\n        flex-wrap: wrap;\n        column-gap: 3.6rem;\n        row-gap: 1.2rem;\n    }\n\n    .reference {\n        color: gray;\n        font-size: 1.4rem;\n    }\n}\n\n@media screen and (max-width: 992px) {\n    footer {\n        width: 100%;\n    }\n}",""]);const d=a},79:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,'* {\n    margin: 0;\n    padding: 0;\n    box-sizing: border-box;\n}\n\n:root {\n    --primary: #191F51;\n    --bootstrap-primary: #007BFF;\n    --dark-green: #005A32;\n    --red: #B90000;\n    --purple: #6F259B;\n    --dark-blue: #1C2A37;\n    \n    font-size: 62.5%;\n    --font-family: "Nunito", sans-serif;\n    --h1: bold 4.8rem var(--font-family);\n    --h2: bold 3.6rem var(--font-family);\n    --h3: bold 2.4rem var(--font-family);\n    --p: bold 2rem var(--font-family);\n}\n\nh1 {\n    font: var(--h1);\n}\n\nh2 {\n    font: var(--h2);\n}\n\nh3 {\n    font: var(--h3);\n}\n\nbody {\n    background-color: var(--primary);\n    color: white;\n    font: var(--p);\n}\n\nimg {\n    max-width: 100%;\n}\n\na {\n    text-decoration: none;\n    color: inherit;\n    display: block;\n    width: fit-content;\n}\n\ntextarea {\n    resize: vertical;\n    min-height: 4.8rem;\n}\n\ninput, textarea, button {\n    width: 100%;\n    font: inherit;\n    color: inherit;\n}\n\n@media screen and (max-width: 992px) {\n    :root {\n        --h1: bold 3.2rem var(--font-family);\n        --h2: bold 2.4rem var(--font-family);\n        --h3: bold 2rem var(--font-family);\n        --p: bold 1.6rem var(--font-family);\n    }\n}\n',""]);const d=a},732:(n,e,r)=>{r.d(e,{A:()=>x});var t=r(601),i=r.n(t),o=r(314),a=r.n(o),d=r(79),c=r(240),l=r(134),m=r(751),s=r(121),p=r(96),u=r(866),g=r(241),f=r(128),h=r(600),b=r(671),v=a()(i());v.i(d.A),v.i(c.A),v.i(l.A),v.i(m.A),v.i(s.A),v.i(p.A),v.i(u.A),v.i(g.A),v.i(f.A),v.i(h.A),v.i(b.A),v.push([n.id,'html {\n    scroll-behavior: smooth;\n}\n\n.parallax {\n    background: no-repeat center top/cover fixed;\n    height: 15rem;\n    border-block: 1rem solid var(--dark-green);\n    position: relative;\n\n    &::before {\n        content: "";\n        position: absolute;\n        inset: 0;\n        background-color: black;\n        opacity: .5;\n    }\n}',""]);const x=v},128:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,"#instagram {\n    min-height: 100vh;\n    display: flex;\n    flex-direction: column;\n    gap: 3.2rem;\n    align-items: center;\n    justify-content: center;\n    padding: 6.4rem 3.2rem;\n    text-align: center;\n    background: linear-gradient(to bottom, #F58529 0%, #DD2A7B 50%, #8134AF 75%, #515BD4 100%);\n    background-attachment: fixed;\n    a {\n        text-transform: uppercase;\n    }\n}",""]);const d=a},134:(n,e,r)=>{r.d(e,{A:()=>p});var t=r(601),i=r.n(t),o=r(314),a=r.n(o),d=r(417),c=r.n(d),l=new URL(r(86),r.b),m=a()(i()),s=c()(l);m.push([n.id,`#introduction {\n    display: grid;\n    min-height: 110vh;\n    grid-template-columns: 1fr 1.2fr;\n    position: relative;\n    justify-content: end;\n\n   \n    #introduction-content {\n        padding: 7.2rem 3.2rem 10rem;\n        text-align: center;\n        h1 {\n            margin-block: 3.2rem 2.4rem;\n            font-size: 3rem;\n        }\n    }\n    \n    #introduction-image {\n        background: url(${s}) no-repeat center top/cover;\n        mask-image: linear-gradient(to right, #ffffff00 3.2rem, #FFF);\n        border-radius: 0 0 6.4rem 6.4rem;\n    } \n}\n\n\n\n@media screen and (max-width: 992px) {\n    #introduction {\n        grid-template-columns: 1fr;\n        #introduction-image {\n            background-attachment: fixed;\n            position: absolute;\n            inset: 0;\n            mask-image: linear-gradient(360deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 34.58%, rgba(153, 153, 153, 0.15) 71.24%, rgba(204, 204, 204, 0) 100%);\n        }\n    }\n}`,""]);const p=m},241:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,"#more {\n    padding: 6.4rem 3.2rem; \n    text-align: center;\n    #more-description {\n        margin-block: 1.6rem 3.2rem;\n    }\n\n    #more-grid {\n        display: grid;\n        grid-template-columns: repeat(3, 1fr);\n        gap: 3.2rem;\n    }\n\n    article {\n        background-color: white;\n        color: var(--primary);\n        border-radius: 3.2rem;\n        overflow: hidden;\n        position: relative;\n\n      h3 {\n        position: absolute;\n        top: 10rem;\n        color: white;\n        width: 100%;\n        font: var(--h2);\n      }\n\n       img {\n        width: 100%;\n        object-fit: cover;\n         height: 25rem;\n         display: block;\n     }\n    \n        p {\n            padding: 3.2rem 2.4rem;\n            text-align: left;\n        }\n    }\n}\n\n@media screen and (max-width: 992px) {\n    #more {\n        padding-inline: 1.6rem;\n        \n        #more-grid {\n            grid-template-columns: 1fr;\n        }\n    }\n}",""]);const d=a},121:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,"#objective {\n    min-height: 100vh;\n    padding: 6.4rem 3.2rem;\n    background: linear-gradient(180deg, #8AC7D9, #FFF);\n    background-attachment: fixed;\n    border-top: 1.6rem solid var(--bootstrap-primary);\n    color: var(--primary);\n    \n    .container {\n        display: grid;\n        grid-template-columns: 1fr 2fr;\n        align-items: center;\n        justify-items: center;\n        gap: 4.8rem;\n    }\n\n    h2 {\n        margin-bottom: 2.4rem;\n    }\n\n    img {\n        width: 100%;\n    }\n}\n\n\n@media screen and (max-width: 992px) {\n    #objective {\n        padding-inline: 1.6rem;\n       \n        .container  {\n            grid-template-columns: 1fr;\n\n            img {\n                max-width: 28rem;\n            }\n        }\n    }\n}",""]);const d=a},96:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,"#recognize {\n    padding: 6.4rem 3.2rem;\n    text-align: center;\n    \n    h2 {\n        margin-bottom: 1.6rem;\n    }\n    \n    #recognize-gallery {\n        display: grid;\n        grid-template-columns: 2fr 1fr 1fr;\n        grid-template-rows: 1fr 1fr;\n        gap: 1.6rem;\n        margin-block: 4.8rem;\n        \n        figure:nth-child(1) {\n            grid-column: 1 / 2;\n            grid-row: 1 / 3;\n        }\n    }\n    \n    figure {\n        border-radius: 3.2rem;\n        background-color: white;\n        overflow: hidden;\n        display: flex;\n        flex-direction: column;\n        align-items: stretch;\n        \n        img {\n            flex-grow: 1;\n            object-fit: cover;\n            width: 100%;\n        }\n    }\n    \n    figcaption {\n        color: var(--primary);\n        padding: 1.2rem;\n    }\n    \n    p:last-child {\n        margin-inline: auto;\n        padding: 1.6rem;\n        max-width: 1100px;\n        background: linear-gradient(to bottom, #0C9DA9 0%, #3DB785 50%, #7ED758 100%);\n        background-attachment: fixed;\n        border-radius: 3.2rem;    \n        font: var(--h3);    \n    }\n}\n\n@media screen and (max-width: 992px) {\n    #recognize {\n        padding-inline: 1.6rem;\n        #recognize-gallery {\n            grid-template-columns: 1fr;\n            grid-template-rows: auto;\n        }\n    }\n}",""]);const d=a},866:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,"#selective-process {\n    display: flex;\n    border-top: 1.6rem solid var(--dark-green);\n    padding-top: 6.4rem;\n    text-align: center;\n    gap: 6.4rem;\n\n    #selective-process-content {\n        align-self: center;\n        margin-inline: auto;\n        display: grid;\n        justify-items: center;\n\n        P {\n            background-color: var(--red);\n            padding: .8rem 3.2rem;\n            border-radius: 3.2rem;\n        }\n\n        h2 {\n            margin-block: 3.2rem;\n        }\n\n        a {\n           text-transform: uppercase;\n        }\n\n        padding-inline: 3.2rem;\n    }\n\n    #selective-process-schedule {\n        align-self: flex-end;\n        h3 {\n            font: var(--h2);\n            margin-bottom: 1.6rem;\n        }\n        img {\n            display: block;\n        }\n    }\n}\n\n@media screen and (max-width: 992px) {\n    #selective-process {\n        flex-direction: column;\n    }\n}",""]);const d=a},240:(n,e,r)=>{r.d(e,{A:()=>d});var t=r(601),i=r.n(t),o=r(314),a=r.n(o)()(i());a.push([n.id,".container {\n    max-width: 144rem;\n    margin-inline: auto;\n}\n\n.btn-primary, .btn-success, .btn-purple {\n    color: white;\n    cursor: pointer;\n    padding: 1.6rem 3.2rem;\n    border-radius: 3.2rem;\n    text-transform: uppercase;\n}\n\n.btn-success {\n    background-color: var(--dark-green);\n}\n\n.btn-purple {\n    background-color: var(--purple);\n}\n\n.btn-primary {\n    background-color: var(--primary);\n}\n\n.input-container {\n    display: flex;\n    flex-direction: column;\n    gap: 1.6rem;\n    position: relative;\n}\n\n.input-field {\n    width: 100%;\n    border: none;\n    outline: none;\n    background: none;\n    color: var(--primary);\n    border-bottom: .3rem solid var(--primary);\n    padding: 0;\n    padding-bottom: .8rem;\n}\n\n.input-label-container {\n    display: flex;\n    gap: 1.6rem;\n    align-items: center;\n    position: absolute;\n    pointer-events: none;\n    transition: transform .3s;\n}\n\n.input-container:has(:valid), .input-container:has(:focus) {\n    .input-label-container {\n        transform: translateY(-120%);\n        font-size: 1.4rem;\n\n        .input-icon {\n            height: 1.4rem;\n        }\n    }\n}\n\n[disabled] {\n    opacity: .6;\n    cursor: not-allowed;\n}",""]);const d=a},314:n=>{n.exports=function(n){var e=[];return e.toString=function(){return this.map((function(e){var r="",t=void 0!==e[5];return e[4]&&(r+="@supports (".concat(e[4],") {")),e[2]&&(r+="@media ".concat(e[2]," {")),t&&(r+="@layer".concat(e[5].length>0?" ".concat(e[5]):""," {")),r+=n(e),t&&(r+="}"),e[2]&&(r+="}"),e[4]&&(r+="}"),r})).join("")},e.i=function(n,r,t,i,o){"string"==typeof n&&(n=[[null,n,void 0]]);var a={};if(t)for(var d=0;d<this.length;d++){var c=this[d][0];null!=c&&(a[c]=!0)}for(var l=0;l<n.length;l++){var m=[].concat(n[l]);t&&a[m[0]]||(void 0!==o&&(void 0===m[5]||(m[1]="@layer".concat(m[5].length>0?" ".concat(m[5]):""," {").concat(m[1],"}")),m[5]=o),r&&(m[2]?(m[1]="@media ".concat(m[2]," {").concat(m[1],"}"),m[2]=r):m[2]=r),i&&(m[4]?(m[1]="@supports (".concat(m[4],") {").concat(m[1],"}"),m[4]=i):m[4]="".concat(i)),e.push(m))}},e}},417:n=>{n.exports=function(n,e){return e||(e={}),n?(n=String(n.__esModule?n.default:n),/^['"].*['"]$/.test(n)&&(n=n.slice(1,-1)),e.hash&&(n+=e.hash),/["'() \t\n]|(%20)/.test(n)||e.needQuotes?'"'.concat(n.replace(/"/g,'\\"').replace(/\n/g,"\\n"),'"'):n):n}},601:n=>{n.exports=function(n){return n[1]}},72:n=>{var e=[];function r(n){for(var r=-1,t=0;t<e.length;t++)if(e[t].identifier===n){r=t;break}return r}function t(n,t){for(var o={},a=[],d=0;d<n.length;d++){var c=n[d],l=t.base?c[0]+t.base:c[0],m=o[l]||0,s="".concat(l," ").concat(m);o[l]=m+1;var p=r(s),u={css:c[1],media:c[2],sourceMap:c[3],supports:c[4],layer:c[5]};if(-1!==p)e[p].references++,e[p].updater(u);else{var g=i(u,t);t.byIndex=d,e.splice(d,0,{identifier:s,updater:g,references:1})}a.push(s)}return a}function i(n,e){var r=e.domAPI(e);return r.update(n),function(e){if(e){if(e.css===n.css&&e.media===n.media&&e.sourceMap===n.sourceMap&&e.supports===n.supports&&e.layer===n.layer)return;r.update(n=e)}else r.remove()}}n.exports=function(n,i){var o=t(n=n||[],i=i||{});return function(n){n=n||[];for(var a=0;a<o.length;a++){var d=r(o[a]);e[d].references--}for(var c=t(n,i),l=0;l<o.length;l++){var m=r(o[l]);0===e[m].references&&(e[m].updater(),e.splice(m,1))}o=c}}},659:n=>{var e={};n.exports=function(n,r){var t=function(n){if(void 0===e[n]){var r=document.querySelector(n);if(window.HTMLIFrameElement&&r instanceof window.HTMLIFrameElement)try{r=r.contentDocument.head}catch(n){r=null}e[n]=r}return e[n]}(n);if(!t)throw new Error("Couldn't find a style target. This probably means that the value for the 'insert' parameter is invalid.");t.appendChild(r)}},540:n=>{n.exports=function(n){var e=document.createElement("style");return n.setAttributes(e,n.attributes),n.insert(e,n.options),e}},56:(n,e,r)=>{n.exports=function(n){var e=r.nc;e&&n.setAttribute("nonce",e)}},825:n=>{n.exports=function(n){if("undefined"==typeof document)return{update:function(){},remove:function(){}};var e=n.insertStyleElement(n);return{update:function(r){!function(n,e,r){var t="";r.supports&&(t+="@supports (".concat(r.supports,") {")),r.media&&(t+="@media ".concat(r.media," {"));var i=void 0!==r.layer;i&&(t+="@layer".concat(r.layer.length>0?" ".concat(r.layer):""," {")),t+=r.css,i&&(t+="}"),r.media&&(t+="}"),r.supports&&(t+="}");var o=r.sourceMap;o&&"undefined"!=typeof btoa&&(t+="\n/*# sourceMappingURL=data:application/json;base64,".concat(btoa(unescape(encodeURIComponent(JSON.stringify(o))))," */")),e.styleTagTransform(t,n,e.options)}(e,n,r)},remove:function(){!function(n){if(null===n.parentNode)return!1;n.parentNode.removeChild(n)}(e)}}}},113:n=>{n.exports=function(n,e){if(e.styleSheet)e.styleSheet.cssText=n;else{for(;e.firstChild;)e.removeChild(e.firstChild);e.appendChild(document.createTextNode(n))}}},86:(n,e,r)=>{n.exports=r.p+"71ac818c6b474dc85cee.jpg"}},e={};function r(t){var i=e[t];if(void 0!==i)return i.exports;var o=e[t]={id:t,exports:{}};return n[t](o,o.exports,r),o.exports}r.m=n,r.n=n=>{var e=n&&n.__esModule?()=>n.default:()=>n;return r.d(e,{a:e}),e},r.d=(n,e)=>{for(var t in e)r.o(e,t)&&!r.o(n,t)&&Object.defineProperty(n,t,{enumerable:!0,get:e[t]})},r.g=function(){if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(n){if("object"==typeof window)return window}}(),r.o=(n,e)=>Object.prototype.hasOwnProperty.call(n,e),(()=>{var n;r.g.importScripts&&(n=r.g.location+"");var e=r.g.document;if(!n&&e&&(e.currentScript&&"SCRIPT"===e.currentScript.tagName.toUpperCase()&&(n=e.currentScript.src),!n)){var t=e.getElementsByTagName("script");if(t.length)for(var i=t.length-1;i>-1&&(!n||!/^http(s?):/.test(n));)n=t[i--].src}if(!n)throw new Error("Automatic publicPath is not supported in this browser");n=n.replace(/#.*$/,"").replace(/\?.*$/,"").replace(/\/[^\/]+$/,"/"),r.p=n})(),r.b=document.baseURI||self.location.href,r.nc=void 0;var t=r(72),i=r.n(t),o=r(825),a=r.n(o),d=r(659),c=r.n(d),l=r(56),m=r.n(l),s=r(540),p=r.n(s),u=r(113),g=r.n(u),f=r(732),h={};h.styleTagTransform=g(),h.setAttributes=m(),h.insert=c().bind(null,"head"),h.domAPI=a(),h.insertStyleElement=p(),i()(f.A,h),f.A&&f.A.locals&&f.A.locals})();