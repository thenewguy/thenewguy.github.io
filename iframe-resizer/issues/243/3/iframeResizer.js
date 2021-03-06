/*
 * File: iframeResizer.js
 * Desc: Force iframes to size to content.
 * Requires: iframeResizer.contentWindow.js to be loaded into the target frame.
 * Doc: https://github.com/davidjbradshaw/iframe-resizer
 * Author: David J. Bradshaw - dave@bradshaw.net
 * Contributor: Jure Mav - jure.mav@gmail.com
 * Contributor: Reed Dadoune - reed@dadoune.com
 */


// TEST-CODE-START //

window.__testHooks__ = window.__testHooks__  || {};
window.__testHooks__.parent = {};

// TEST-CODE-END //


;(function(window) {
    'use strict';

    var
        count                 = 0,
        logEnabled            = false,
        hiddenCheckEnabled    = false,
        msgHeader             = 'message',
        msgHeaderLen          = msgHeader.length,
        msgId                 = '[iFrameSizer]', //Must match iframe msg ID
        msgIdLen              = msgId.length,
        pagePosition          = null,
        requestAnimationFrame = window.requestAnimationFrame,
        resetRequiredMethods  = {max:1,scroll:1,bodyScroll:1,documentElementScroll:1},
        settings              = {},
        timer                 = null,
        logId                = 'Host Page',


        defaults              = {
            autoResize                : true,
            bodyBackground            : null,
            bodyMargin                : null,
            bodyMarginV1              : 8,
            bodyPadding               : null,
            checkOrigin               : true,
            inPageLinks               : false,
            enablePublicMethods       : true,
            heightCalculationMethod   : 'bodyOffset',
            id                        : 'iFrameResizer',
            interval                  : 32,
            log                       : false,
            maxHeight                 : Infinity,
            maxWidth                  : Infinity,
            minHeight                 : 0,
            minWidth                  : 0,
            resizeFrom                : 'parent',
            scrolling                 : false,
            sizeHeight                : true,
            sizeWidth                 : false,
            tolerance                 : 0,
            widthCalculationMethod    : 'scroll',
            closedCallback            : function(){},
            initCallback              : function(){},
            messageCallback           : function(){warn('MessageCallback function not defined');},
            resizedCallback           : function(){},
            scrollCallback            : function(){return true;}
        };

    function addEventListener(obj,evt,func){
        if ('addEventListener' in window){
            obj.addEventListener(evt,func, false);
        } else if ('attachEvent' in window){//IE
            obj.attachEvent('on'+evt,func);
        }
    }

    function setupRequestAnimationFrame(){
        var
            vendors = ['moz', 'webkit', 'o', 'ms'],
            x;

        // Remove vendor prefixing if prefixed and break early if not
        for (x = 0; x < vendors.length && !requestAnimationFrame; x += 1) {
            requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
        }

        if (!(requestAnimationFrame)){
            log('setup','RequestAnimationFrame not supported');
        }
    }

    function getMyID(iframeId){
        var retStr = 'Host page: '+iframeId;

        if (window.top!==window.self){
            if (window.parentIFrame){
                retStr = window.parentIFrame.getId()+': '+iframeId;
            } else {
                retStr = 'Nested host page: '+iframeId;
            }
        }

        return retStr;
    }


    function formatLogHeader(iframeId){
        return msgId + '[' + getMyID(iframeId) + ']';
    }

    function log(iframeId,msg){
        if ((settings[iframeId] ? settings[iframeId].log : logEnabled) && ('object' === typeof window.console)){
            console.log(formatLogHeader(iframeId),msg);
        }
    }

    function warn(iframeId,msg){
        if ('object' === typeof window.console){
            console.warn(formatLogHeader(iframeId),msg);
        }
    }

    function iFrameListener(event){
        function resizeIFrame(){
            function resize(){
                setSize(messageData);
                if('resetPage' === messageData.type) setPagePosition(iframeId);
            }

            ensureInRange('Height');
            ensureInRange('Width');

            syncResize(resize,messageData,'resetPage');
        }

        function processMsg(){
            var data = msg.substr(msgIdLen).split(':');

            return {
                iframe: settings[data[0]].iframe,
                id:     data[0],
                height: data[1],
                width:  data[2],
                type:   data[3]
            };
        }

        function ensureInRange(Dimension){
            var
                max  = Number(settings[iframeId]['max'+Dimension]),
                min  = Number(settings[iframeId]['min'+Dimension]),
                dimension = Dimension.toLowerCase(),
                size = Number(messageData[dimension]);

            if (min>max){
                throw new Error('Value for min'+Dimension+' can not be greater than max'+Dimension);
            }

            log(iframeId,'Checking '+dimension+' is in range '+min+'-'+max);

            if (size<min) {
                size=min;
                log(iframeId,'Set '+dimension+' to min value');
            }

            if (size>max) {
                size=max;
                log(iframeId,'Set '+dimension+' to max value');
            }

            messageData[dimension]=''+size;
        }


        function isMessageFromIFrame(){
            function checkAllowedOrigin(){
                function checkList(){
                    log(iframeId,'Checking connection is from allowed list of origins: ' + checkOrigin);
                    var i;
                    for (i = 0; i < checkOrigin.length; i++) {
                        if (checkOrigin[i] === origin) {
                            return true;
                        }
                    }
                    return false;
                }

                function checkSingle(){
                    var remoteHost  = settings[iframeId].remoteHost;
                    log(iframeId,'Checking connection is from: '+remoteHost);
                    return origin === remoteHost;
                }

                return checkOrigin.constructor === Array ? checkList() : checkSingle();
            }

            var
                origin      = event.origin,
                checkOrigin = settings[iframeId].checkOrigin;

            if (checkOrigin) {
                if ((''+origin !== 'null') && !checkAllowedOrigin()) {
                    throw new Error(
                        'Unexpected message received from: ' + origin +
                        ' for ' + messageData.iframe.id +
                        '. Message was: ' + event.data +
                        '. This error can be disabled by setting the checkOrigin: false option or by providing of array of trusted domains.'
                    );
                }
            }

            return true;
        }

        function isMessageForUs(){
            return msgId === (('' + msg).substr(0,msgIdLen)) && (msg.substr(msgIdLen).split(':')[0] in settings); //''+Protects against non-string msg
        }

        function isMessageFromMetaParent(){
            //Test if this message is from a parent above us. This is an ugly test, however, updating
            //the message format would break backwards compatibity.
            var retCode = messageData.type in {'true':1,'false':1,'undefined':1};

            if (retCode){
                log(iframeId,'Ignoring init message from meta parent page');
            }

            return retCode;
        }

        function getMsgBody(offset){
            return msg.substr(msg.indexOf(':')+msgHeaderLen+offset);
        }

        function forwardMsgFromIFrame(msgBody){
            log(iframeId,'MessageCallback passed: {iframe: '+ messageData.iframe.id + ', message: ' + msgBody + '}');
            settings[iframeId].messageCallback({
                iframe: messageData.iframe,
                message: JSON.parse(msgBody)
            });
            log(iframeId,'--');
        }

        function checkIFrameExists(){
            if (null === messageData.iframe) {
                warn(iframeId,'IFrame ('+messageData.id+') not found');
                return false;
            }
            return true;
        }

        function getElementPosition(target){
            var iFramePosition = target.getBoundingClientRect();

            getPagePosition(iframeId);

            return {
                x: parseInt(iFramePosition.left, 10) + parseInt(pagePosition.x, 10),
                y: parseInt(iFramePosition.top, 10)  + parseInt(pagePosition.y, 10)
            };
        }

        function scrollRequestFromChild(addOffset){
            function reposition(){
                pagePosition = newPosition;
                scrollTo();
                log(iframeId,'--');
            }

            function calcOffset(){
                return {
                    x: Number(messageData.width) + offset.x,
                    y: Number(messageData.height) + offset.y
                };
            }

            var
                offset = addOffset ? getElementPosition(messageData.iframe) : {x:0,y:0},
                newPosition = calcOffset();

            log(iframeId,'Reposition requested from iFrame (offset x:'+offset.x+' y:'+offset.y+')');

            if(window.top!==window.self){
                if (window.parentIFrame){
                    window.parentIFrame['scrollTo'+(addOffset?'Offset':'')](newPosition.x,newPosition.y);
                } else {
                    warn(iframeId,'Unable to scroll to requested position, window.parentIFrame not found');
                }
            } else {
                reposition();
            }
        }

        function scrollTo(){
            if (false !== settings[iframeId].scrollCallback(pagePosition)){
                setPagePosition(iframeId);
            }
        }

        function findTarget(location){
            function jumpToTarget(target){
                var jumpPosition = getElementPosition(target);

                log(iframeId,'Moving to in page link (#'+hash+') at x: '+jumpPosition.x+' y: '+jumpPosition.y);
                pagePosition = {
                    x: jumpPosition.x,
                    y: jumpPosition.y
                };

                scrollTo();
                log(iframeId,'--');
            }

            var
                hash     = location.split('#')[1] || '',
                hashData = decodeURIComponent(hash),
                target   = document.getElementById(hashData) || document.getElementsByName(hashData)[0];

            if(window.top!==window.self){
                if (window.parentIFrame){
                    window.parentIFrame.moveToAnchor(hash);
                } else {
                    log(iframeId,'In page link #'+hash+' not found and window.parentIFrame not found');
                }
            } else if (target){
                jumpToTarget(target);
            } else {
                log(iframeId,'In page link #'+hash+' not found');
            }
        }

        function callback(func,val){
            if( 'function' === typeof func){
                func(val);
            }
        }

        function actionMsg(){

            if(settings[iframeId].firstRun) firstRun();

            switch(messageData.type){
            case 'close':
                closeIFrame(messageData.iframe);
                break;
            case 'message':
                forwardMsgFromIFrame(getMsgBody(6));
                break;
            case 'scrollTo':
                scrollRequestFromChild(false);
                break;
            case 'scrollToOffset':
                scrollRequestFromChild(true);
                break;
            case 'inPageLink':
                findTarget(getMsgBody(9));
                break;
            case 'reset':
                resetIFrame(messageData);
                break;
            case 'init':
                resizeIFrame();
                callback(settings[iframeId].initCallback,messageData.iframe);
                callback(settings[iframeId].resizedCallback,messageData);
                break;
            default:
                resizeIFrame();
                callback(settings[iframeId].resizedCallback,messageData);
            }
        }

        function hasSettings(iframeId){
            var retBool = true;

            if (!settings[iframeId]){
                retBool = false;
                warn(messageData.type + ' No settings for ' + iframeId + '. Message was: ' + msg);
            }

            return retBool;
        }

        function iFrameReadyMsgReceived(){
            for (var iframeId in settings){
                trigger('iFrame requested init',createOutgoingMsg(iframeId),document.getElementById(iframeId),iframeId);
            }
        }

        function firstRun() {
            settings[iframeId].firstRun = false;
        }

        var
            msg = event.data,
            messageData = {},
            iframeId = null;

        if('[iFrameResizerChild]Ready' === msg){
            iFrameReadyMsgReceived();
        } else if (isMessageForUs()){
            messageData = processMsg();
            iframeId    = logId = messageData.id;

            if (!isMessageFromMetaParent() && hasSettings(iframeId)){
                log(iframeId,'Received: '+msg);

                if ( checkIFrameExists() && isMessageFromIFrame() ){
                    actionMsg();
                }
            }
        } else {
            //log(iframeId,'Ignored: '+msg);
        }

    }


    function closeIFrame(iframe){
        var iframeId = iframe.id;

        log(iframeId,'Removing iFrame: '+iframeId);
        iframe.parentNode.removeChild(iframe);
        if(settings[iframeId]) {
            settings[iframeId].closedCallback(iframeId);
        }
        log(iframeId,'--');
        delete settings[iframeId];
    }

    function getPagePosition(iframeId){
        if(null === pagePosition){
            pagePosition = {
                x: (window.pageXOffset !== undefined) ? window.pageXOffset : document.documentElement.scrollLeft,
                y: (window.pageYOffset !== undefined) ? window.pageYOffset : document.documentElement.scrollTop
            };
            log(iframeId,'Get page position: '+pagePosition.x+','+pagePosition.y);
        }
    }

    function setPagePosition(iframeId){
        if(null !== pagePosition){
            window.scrollTo(pagePosition.x,pagePosition.y);
            log(iframeId,'Set page position: '+pagePosition.x+','+pagePosition.y);
            pagePosition = null;
        }
    }

    function resetIFrame(messageData){
        function reset(){
            setSize(messageData);
            trigger('reset','reset',messageData.iframe,messageData.id);
        }

        log(messageData.id,'Size reset requested by '+('init'===messageData.type?'host page':'iFrame'));
        getPagePosition(messageData.id);
        syncResize(reset,messageData,'reset');
    }

    function setSize(messageData){
        function setDimension(dimension){
            messageData.iframe.style[dimension] = messageData[dimension] + 'px';
            log(
                messageData.id,
                'IFrame (' + iframeId +
                ') ' + dimension +
                ' set to ' + messageData[dimension] + 'px'
            );
        }

        function chkZero(dimension){
            //FireFox sets dimension of hidden iFrames to zero.
            //So if we detect that set up an event to check for
            //when iFrame becomes visible.

            if (!hiddenCheckEnabled && '0' === messageData[dimension]){
                hiddenCheckEnabled = true;
                log(iframeId,'Hidden iFrame detected, creating visibility listener');
                fixHiddenIFrames();
            }
        }

        function processDimension(dimension){
            setDimension(dimension);
            chkZero(dimension);
        }

        var iframeId = messageData.iframe.id;

        if(settings[iframeId]){
            if( settings[iframeId].sizeHeight) { processDimension('height'); }
            if( settings[iframeId].sizeWidth ) { processDimension('width'); }
        }
    }

    function syncResize(func,messageData,doNotSync){
        if(doNotSync!==messageData.type && requestAnimationFrame){
            log(messageData.id,'Requesting animation frame');
            requestAnimationFrame(func);
        } else {
            func();
        }
    }

    function trigger(calleeMsg,msg,iframe,id){
        function postMessageToIFrame(){
            log(id,'[' + calleeMsg + '] Sending msg to iframe['+id+'] ('+msg+')');
            iframe.contentWindow.postMessage( msgId + msg, target );
        }

        function iFrameNotFound(){
            warn(id,'[' + calleeMsg + '] IFrame('+id+') not found');
            if(settings[id]) {
                delete settings[id];
            }
        }

        id = id || iframe.id;
        var target = settings[id].targetOrigin;

        if(iframe && 'contentWindow' in iframe){
            postMessageToIFrame();
        } else {
            iFrameNotFound();
        }
    }

    function createOutgoingMsg(iframeId){
        return iframeId +
            ':' + settings[iframeId].bodyMarginV1 +
            ':' + settings[iframeId].sizeWidth +
            ':' + settings[iframeId].log +
            ':' + settings[iframeId].interval +
            ':' + settings[iframeId].enablePublicMethods +
            ':' + settings[iframeId].autoResize +
            ':' + settings[iframeId].bodyMargin +
            ':' + settings[iframeId].heightCalculationMethod +
            ':' + settings[iframeId].bodyBackground +
            ':' + settings[iframeId].bodyPadding +
            ':' + settings[iframeId].tolerance +
            ':' + settings[iframeId].inPageLinks +
            ':' + settings[iframeId].resizeFrom +
            ':' + settings[iframeId].widthCalculationMethod;
    }

    function setupIFrame(iframe,options){
        function setLimits(){
            function addStyle(style){
                if ((Infinity !== settings[iframeId][style]) && (0 !== settings[iframeId][style])){
                    iframe.style[style] = settings[iframeId][style] + 'px';
                    log(iframeId,'Set '+style+' = '+settings[iframeId][style]+'px');
                }
            }

            addStyle('maxHeight');
            addStyle('minHeight');
            addStyle('maxWidth');
            addStyle('minWidth');
        }

        function ensureHasId(iframeId){
            logId=iframeId;
            if (''===iframeId){
                iframe.id = iframeId = (options.id || defaults.id) + count++;
                logEnabled = (options || {}).log;
                logId=iframeId;
                log(iframeId,'Added missing iframe ID: '+ iframeId +' (' + iframe.src + ')');
            }


            return iframeId;
        }

        function setScrolling(){
            log(iframeId,'IFrame scrolling ' + (settings[iframeId].scrolling ? 'enabled' : 'disabled') + ' for ' + iframeId);
            iframe.style.overflow = false === settings[iframeId].scrolling ? 'hidden' : 'auto';
            iframe.scrolling      = false === settings[iframeId].scrolling ? 'no' : 'yes';
        }

        //The V1 iFrame script expects an int, where as in V2 expects a CSS
        //string value such as '1px 3em', so if we have an int for V2, set V1=V2
        //and then convert V2 to a string PX value.
        function setupBodyMarginValues(){
            if (('number'===typeof(settings[iframeId].bodyMargin)) || ('0'===settings[iframeId].bodyMargin)){
                settings[iframeId].bodyMarginV1 = settings[iframeId].bodyMargin;
                settings[iframeId].bodyMargin   = '' + settings[iframeId].bodyMargin + 'px';
            }
        }

        function checkReset(){
            // Reduce scope of firstRun to function, because IE8's JS execution
            // context stack is borked and this value gets externally
            // changed midway through running this function!!!
            var
                firstRun          = settings[iframeId].firstRun,
                restRequertMethod = settings[iframeId].heightCalculationMethod in resetRequiredMethods;

            if (!firstRun && restRequertMethod){
                resetIFrame({iframe:iframe, height:0, width:0, type:'init'});
            }
        }

        function setupIFrameObject(){
            if(Function.prototype.bind){ //Ignore unpolyfilled IE8.
                settings[iframeId].iframe.iFrameResizer = {

                    close        : closeIFrame.bind(null,settings[iframeId].iframe),

                    resize       : trigger.bind(null,'Window resize', 'resize', settings[iframeId].iframe),

                    moveToAnchor : function(anchor){
                        trigger('Move to anchor','inPageLink:'+anchor, settings[iframeId].iframe,iframeId);
                    },

                    sendMessage  : function(message){
                        message = JSON.stringify(message);
                        trigger('Send Message','message:'+message, settings[iframeId].iframe,iframeId);
                    }
                };
            }
        }

        //We have to call trigger twice, as we can not be sure if all
        //iframes have completed loading when this code runs. The
        //event listener also catches the page changing in the iFrame.
        function init(msg){
            function iFrameLoaded(){
                trigger('iFrame.onload',msg,iframe);
                checkReset();
            }

            addEventListener(iframe,'load',iFrameLoaded);
            trigger('init',msg,iframe);
        }

        function checkOptions(options){
            if ('object' !== typeof options){
                throw new TypeError('Options is not an object.');
            }
        }

        function copyOptions(options){
            for (var option in defaults) {
                if (defaults.hasOwnProperty(option)){
                    settings[iframeId][option] = options.hasOwnProperty(option) ? options[option] : defaults[option];
                }
            }
        }

        function getTargetOrigin (remoteHost){
            return ('' === remoteHost || 'file://' === remoteHost) ? '*' : remoteHost;
        }

        function processOptions(options){
            options = options || {};
            settings[iframeId] = {
                firstRun    : true,
                iframe      : iframe,
                remoteHost  : iframe.src.split('/').slice(0,3).join('/')
            };

            checkOptions(options);
            copyOptions(options);

            settings[iframeId].targetOrigin = true === settings[iframeId].checkOrigin ? getTargetOrigin(settings[iframeId].remoteHost) : '*';
        }

        function beenHere(){
            return (iframeId in settings && 'iFrameResizer' in iframe);
        }

        var iframeId = ensureHasId(iframe.id);

        if (!beenHere()){
            processOptions(options);
            setScrolling();
            setLimits();
            setupBodyMarginValues();
            init(createOutgoingMsg(iframeId));
            setupIFrameObject();
        } else {
            warn(iframeId,'Ignored iFrame, already setup.');
        }
    }

    function debouce(fn,time){
        if (null === timer){
            timer = setTimeout(function(){
                timer = null;
                fn();
            }, time);
        }
    }

    function isVisible(el) {
        return (null !== el.offsetParent);
    }

    function fixHiddenIFrames(){
        function checkIFrames(){
            function checkIFrame(settingId){
                function chkDimension(dimension){
                    return '0px' === settings[settingId].iframe.style[dimension];
                }

                if (isVisible(settings[settingId].iframe) && (chkDimension('height') || chkDimension('width'))){
                    trigger('Visibility change', 'resize', settings[settingId].iframe,settingId);
                }
            }

            for (var settingId in settings){
                checkIFrame(settingId);
            }
        }

        function mutationObserved(mutations){
            log('window','Mutation observed: ' + mutations[0].target + ' ' + mutations[0].type);
            debouce(checkIFrames,16);
        }

        function createMutationObserver(){
            var
                target = document.querySelector('body'),

                config = {
                    attributes            : true,
                    attributeOldValue     : false,
                    characterData         : true,
                    characterDataOldValue : false,
                    childList             : true,
                    subtree               : true
                },

                observer = new MutationObserver(mutationObserved);

            observer.observe(target, config);
        }

        var MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

        if (MutationObserver) createMutationObserver();
    }

    function setupEventListeners(){
        function resizeIFrames(event){
            function resize(){
                sendTriggerMsg('Window '+event,'resize');
            }

            log('window','Trigger event: '+event);
            debouce(resize,16);
        }

        function tabVisible() {
            function resize(){
                sendTriggerMsg('Tab Visable','resize');
            }

            if('hidden' !== document.visibilityState) {
                log('document','Trigger event: Visiblity change');
                debouce(resize,16);
            }
        }

        function sendTriggerMsg(eventName,event){
            function isIFrameResizeEnabled(iframeId) {
                return  'parent' === settings[iframeId].resizeFrom &&
                        settings[iframeId].autoResize &&
                        !settings[iframeId].firstRun;
            }

            for (var iframeId in settings){
                if(isIFrameResizeEnabled(iframeId)){
                    trigger(eventName,event,document.getElementById(iframeId),iframeId);
                }
            }
        }

        addEventListener(window,'message',iFrameListener);

        addEventListener(window,'resize', function(){resizeIFrames('resize');});

        addEventListener(document,'visibilitychange',tabVisible);
        addEventListener(document,'-webkit-visibilitychange',tabVisible); //Andriod 4.4
        addEventListener(window,'focusin',function(){resizeIFrames('focus');}); //IE8-9
        addEventListener(window,'focus',function(){resizeIFrames('focus');});
    }


    function factory(){
        function init(options,element){
            if(!element.tagName) {
                throw new TypeError('Object is not a valid DOM element');
            } else if ('IFRAME' !== element.tagName.toUpperCase()) {
                throw new TypeError('Expected <IFRAME> tag, found <'+element.tagName+'>.');
            } else {
                setupIFrame(element, options);
                iFrames.push(element);
            }
        }

        var iFrames;

        setupRequestAnimationFrame();
        setupEventListeners();

        return function iFrameResizeF(options,target){
            iFrames = []; //Only return iFrames past in on this call

            switch (typeof(target)){
            case 'undefined':
            case 'string':
                Array.prototype.forEach.call(
                    document.querySelectorAll( target || 'iframe' ),
                    init.bind(undefined, options)
                );
                break;
            case 'object':
                init(options,target);
                break;
            default:
                throw new TypeError('Unexpected data type ('+typeof(target)+').');
            }

            return iFrames;
        };
    }

    function createJQueryPublicMethod($){
        $.fn.iFrameResize = function $iFrameResizeF(options) {
            return this.filter('iframe').each(function (index, element) {
                setupIFrame(element, options);
            }).end();
        };
    }

    if (window.jQuery) { createJQueryPublicMethod(jQuery); }

    if (typeof define === 'function' && define.amd) {
        define([],factory);
    } else if (typeof module === 'object' && typeof module.exports === 'object') { //Node for browserfy
        module.exports = factory();
    } else {
        window.iFrameResize = window.iFrameResize || factory();
    }

})(window || {});