import { randomString } from "./utils.js";
import { DOMComponentRegistry } from "./dom_component_registry.js";
import { PostOffice } from "./post_office.js";
import { DataSource } from "./data_source.js";
import { stringToHTMLFrag } from "./utils.js";

class DOMComponent extends HTMLElement {

	static get observedAttributes() { return ['data-update']; }

	defaultLifecycleInterfaces (state){
		var defaultBrokers = [
					{state: "datasrcInit", label :"init-data-src-" + this.uid}
			   ]

		if(state){
			return defaultBrokers.filter((_broker)=>{
				return _broker.state == state;
			});
		}
		return defaultBrokers;
	}

	static defaultStateSpace = {
		"idle" : {apriori:[]}
	}

	constructor(opt){
		super();
		if(this._isDebuggale()){
			TRASH_SCOPE._debugCmp = this;
		}
		var opt = opt || {};

		this.data = this.constructor.schema || {};
		this.schema = this.constructor.schema || {};
		this.domElName = this.constructor.domElName || opt.domElName;
		this.interfaces = this.constructor.interfaces || opt.interfaces;
		this.stateSpace = this.constructor.stateSpace || opt.stateSpace;
		this.transitionSpace = {};

		this.uid = this.uid || randomString(8);
		this.composedScope = {};
		this.uiVars = {};
		this.data_src = null;
		this.current_state = "idle";
		this.opt = opt;
		this.eventTarget = new EventTarget();
	}


	connectedCallback() {
		var opt = this.opt;
		this.__init__(opt);
		if(this.onConnect) {
			this.switchToIdleState(); //default state switch to idle (NOTE - before calling the onConnect method of the instance)
			this.onConnect.call(this);
		}
	}

	_onDataSrcUpdate(ev) {
		this._log("imp:",this.data_src.label,"- ","component data update signal received");
		this.render();
	}

	attributeChangedCallback () {
		this.render();
	}

	__init__(opt) {
		var _this = this;
		this._initLogging();
		this._initStateSpace();

		this._log("imp:","DOMELName = ", this.domElName);
		this._log("imp:","component data/schema = ");
		console.dir(this.data);
		this._log("initialising with ", opt);

		this.shadow = this.attachShadow({mode: opt.domMode || "open"});

		this.markupFunc = this.constructor.markupFunc || opt.markupFunc;

		this.styleMarkup = this.constructor.styleMarkup || opt.styleMarkup;

		this.processData = this.constructor.processData || opt.processData;
	
		if(!this.markupFunc){
			this._log("----------initialisation stopped - no markupFunc found---------------");
			return;
		}

		this._composeAncesstry();

		this._initLifecycle(opt);

		this._log("imp:", "initialised");

		console.groupEnd();
	}

	getParent() {
	  	return DOMComponentRegistry.findInstance(this.parent);
	}

	// _nameChild(_instance) {
	//   	var name = randomString(8);
	//   	_instance.uid = name;
	//   	this.childCmps.push(_instance);
	// }

	_composeAncesstry() {
		DOMComponentRegistry.update(this);

	  	if(this.attributes.parent){
	    	this.parent = this.attributes.parent.value;

	    	if(this.attributes.childscope){
		      	this.getParent().composedScope[this.attributes.childscope.value] = this;
		    }
	   	}
	   	
	   	console.log("composed ancesstory ", this.domElName, ", ", this.uid);
	}

	_initLogging() {
		this._logPrefix =  this.domElName + " #" + this.uid + ":";
		this._logStyle = "font-size: 12px; color:darkred";
		console.group(this._logPrefix);		
	}

	_log() {
		var argumentsArr = Array.prototype.slice.call(arguments);
		if(arguments[0]==="imp:"){
			var msg = argumentsArr.slice(1,argumentsArr.length).join(" ");
			console.log("imp:", "%c" + this._logPrefix, this._logStyle, msg);
		}else{
			console.log("%c" + this._logPrefix, this._logStyle, msg);
		}
	}

	_isDebuggale() {
		return this.hasAttribute("debug");
	}

	_getCmpData(){
		return this.querySelector("component-data");
	}

	_getDomNode(){
		return document.querySelector("[data-component='" + this.uid + "']");
	}

	_initComponentDataSrc(opt){
		var _cmp_data = this._getCmpData();
		if(_cmp_data){
			var label = _cmp_data.getAttribute("label");
			var socket = _cmp_data.getAttribute("socket");
			this._log("imp:","initialising component data source");
			// this.data_src = new DataSource(label, socket, this, proxy);
			this.data_src = DataSource.getOrCreate(label, socket, this);
			this.__initDataSrcInterface(label);
		}
		if(this.data_src){
		 	Object.defineProperty(this, 'data', {
		        get: ()=>{return this._postProcessCmpData.call(this, this.data_src.data);}
		    });
		}else{  //happens when _cmd_data is null or label is null
			this._log("imp:","component data is null, directly rendering the component.");
			this.render();
		}
	}

	__initDataSrcInterface(label) {
		var _this = this;

		this.broker = this.data_src.eventTarget.addEventListener(label, (ev)=>{
			_this._onDataSrcUpdate.call(_this, ev);
		});
		// this.broker = PostOffice.registerBroker(this, label, (_msg)=>{
		// 	_this._onDataSrcUpdate.call(_this, _msg)
		// });
	}

	_initStateSpace(){
		this.stateSpace = {...this.defaultStateSpace , ...this.stateSpace }
	}

	addInterface() {

	}

	_initInterfaces(opt) {
		if(!this.interfaces){return;}

		var _this = this;

		for(var key in this.interfaces) {
			PostOffice.registerBroker(this, `${this.uid}-${key}`, (_msg)=>{
				var response = _this.interfaces[key](_msg);
				PostOffice.broadcastMsg(`${_msg.sender}-${key}`, new Muffin.ComponentMsg({data: response}))
			});
		}
		// var _this = this;
		// this.defaultLifecycleInterfaces().map((_entry)=>{
		// 	PostOffice.registerBroker(_this, _entry.label, (ev)=>{
		// 		_this._initComponentDataSrc.call(_this);
		// 	});
		// });
	}

	_initUiVars(opt) {
		// Object.defineProperty(this, 'uiVars', {
	 //        set: (value)=>{
	 //        	this['uiVars']=value;
	 //        	this.render();
	 //        }
	 //    });
	} 

	_initLifecycle(opt) {
		this._initUiVars(opt);

		this._initInterfaces(opt);

		this._initComponentDataSrc(opt);

	}

	_postProcessCmpData(newData) {
		// console.group(this._logPrefix+"postProcessData");
		this._log("imp:","Post-Processing cmp data (label = " + this.data_src.label + "), data = ");
		console.dir(newData);
		if(this.processData){   //processData can be defined when creating components (see inventory_block.js - MedicineThumbnailList)
			try{
				this._processedData = this.processData.call(this, newData);
				return this._processedData;
			}catch(e){
				this._log("imp:","could not post process CMP data - ", e);
				return newData;
			}
		}
		return newData;
		// console.groupEnd();
	}

	__processStyleMarkup() {
		if(!this.styleMarkup){
			return;
		}
		// if(this._renderedStyle){return;}

	    try{
	    	var _renderedStyleString = this.styleMarkup(`[data-component=${this.uid}]`,this.current_state);  //called only once
	    	this._renderedStyle = stringToHTMLFrag(_renderedStyleString);
	    }catch(e){
	      this._log("imp:", "error in rendering style - ", e);
	      return;
	    }

	    this._renderedFrag.firstElementChild.prepend(this._renderedStyle);
	}

	__processRenderedFragEventListeners () {
		var _this = this;
		this._events = {
			"onchange": [],
			"onclick": [],
			"oninput": []
		};
		this._renderedFrag.querySelectorAll("[on-change]").forEach((_el)=>{
			_el.onchange = function() {
				// _el.attributes["on-change"].value.call(_this);
				_this[_el.attributes["on-change"].value].call(_this, _el);
			}
			this._events.onchange.push(_el.attributes["on-change"]);
		});
		this._renderedFrag.querySelectorAll("[on-input]").forEach((_el)=>{
			_el.oninput = function() {
				_this[_el.attributes["on-input"].value].call(_this, _el);
			}
			this._events.onchange.push(_el.attributes["on-input"]);
		});
		this._renderedFrag.querySelectorAll("[on-click]").forEach((_el)=>{
			_el.onclick = function() {
				_this[_el.attributes["on-click"].value].call(_this, _el);
			}
			this._events.onchange.push(_el.attributes["on-click"]);
		});
	}

	_getChildCmps() {
	    var cmp_dom_node = this._getDomNode();
	    if(!cmp_dom_node){ return []; }
	    return Array.from(cmp_dom_node.querySelectorAll('[data-component]')); 
	}

  	_processChildCmps() {
	    var _this = this;
	    var childCmpsInDOM = _this._getChildCmps();
	    if(childCmpsInDOM.length==0){return;}

	    this._log("imp:", "PROCESSING CHILD CMPS");
	    var cmpSelector = DOMComponentRegistry.list().map((_entry)=>{return _entry.name}).join(",");
	    var childCmpsInRenderedFrag = _this._renderedFrag.querySelectorAll(cmpSelector);


	    childCmpsInRenderedFrag.forEach((_childCmpInFrag, fragCmpIdx)=>{
	      var _childCmpInDom = childCmpsInDOM.find((_cmp, domCmpIdx)=>{
	        return _cmp.constructedFrom.domElName == _childCmpInFrag.tagName.toLowerCase()
	      });
	      if(_childCmpInDom){
	        _childCmpInFrag.replaceWith(_childCmpInDom);
	        // _childCmpInDom.render();
	      }
	      // childCmpsInDOM.splice(domCmpIdx, 1);
	      // childCmpsInDOM.shift();
	    });

	    // childCmpsInDOM.forEach((_childCmp, idx)=>{ //would not work if 2 child elements of the same type
	    //   try{
	    //     _this._renderedFrag.querySelector(_childCmp.dataset.cmpname).replaceWith(_childCmp);
	    //   }catch(e){}
	    // })
  	}

  	switchState(stateName) {
        var targetState = this.stateSpace[stateName];
        if (!targetState) { return; }
        var prevStateName = this.current_state;

        if( targetState.apriori.includes(prevStateName) ){ //only these transitions are allowed. this is to ensure reliability of behviours.
        	var transition = this.transitionSpace[`${prevStateName} <to> ${stateName}`];
	        if(transition){
	        	try{
	        		transition.call(this);
	        		this._log("imp:", "Transition fired - ", `${prevStateName} <to> ${stateName}`);
	        		//if transition is successful (doesn't throw any error) -->
	        		this.current_state = stateName;
        			this.uiVars.state = { name: stateName, meta: targetState};
	        		this.render();
	        	}catch(e){
	        		this._log("imp:", "Transition error - ", e);
	        	}
	        }else{
	        	this.current_state = stateName;
        		this.uiVars.state = { name: stateName, meta: targetState};
        		this.render();
	        }
	        this._log("imp:", "Switched State To - ", this.current_state);
        }

        return this.current_state;
        // this._updateDomNodeState();
        // if(state.informParent){
        //     this._broadCastToParent(this.uiVars.current_state);
        // }
    }

    switchToIdleState({stateName = "idle"} = {}) {
    	var targetState = this.stateSpace[stateName];
        if (!targetState) { return; }
        this.current_state = stateName;
        this.uiVars.state = { name: stateName, meta: targetState};
        return this.current_state;
    }

    __processRootMarkup() {
    	this._renderedFrag.firstElementChild.dataset.component = this.uid;
    	// this.dataset.uid = this.uid;
	    Reflect.defineProperty(this._renderedFrag.firstElementChild, "constructedFrom", {value: this});
	    // this._renderedFrag.querySelectorAll('[uiVar]').forEach((uiVarEl, idx)=>{
	    // 	uiVarEl.dataset.uid = `${this.uid}-uiVar-${idx}`; 
	    // });
    }

    __processConditionalMarkup(_el) { //to be optimised later
	  	if(!_el){
	  		this._renderedFrag.querySelectorAll("[render-if]").forEach((_el)=>{
		  		if(!eval(_el.getAttribute("render-if"))){
		  			_el.style.display = "none";
		  		}
		  	});
	  	}
	  	else{
	  		// console.log("imp:","conditional markup of - ",  _el, " ::::====:::: ", eval(_el.getAttribute("render-if")));
	    	if (!eval(_el.getAttribute("render-if"))) {
	        	_el.style.display = "none";
	      	}else{
	      		_el.style.display = "block";
	      	}
	    }
	}

	__findAndReplaceUnequalNodes = (root1, root2)=>{ //not used currently
  		var _this = this;

        // console.log("imp:", "patchDom: comparing nodes - ", root1, root2);

        if(root2.hasAttribute("render-if")){
        	this.__processConditionalMarkup(root2);
        }

        if (root1.children.length == 0 || root2.children.length==0) {
          // console.log("imp:", "patchDom: replacing node - ", root2, " with ", root1);
          root2.replaceWith(root1);
          return;
        }

        var nonComponentChildren = Array.from(root1.children).filter((_childNode)=>{
        	return !_childNode.constructedFrom;
        })

        nonComponentChildren.forEach((_root1ChildNode, idx) => {
          var _root2ChildNode = root2.children[idx];

          if (!_root1ChildNode.isEqualNode(_root2ChildNode) && !_root2ChildNode.attributes.renderonlyonce && !_root2ChildNode.constructedFrom) {
            // console.log("patchDom: checking nodes - ", _root2ChildNode);
            	_this.__findAndReplaceUnequalNodes(_root1ChildNode, _root2ChildNode);
          }
        });
    }


    __patchDOM() {
    	if(this.attributes.stop){
	      TRASH_SCOPE.stoppedCmp = this;
	      return;
	    }

	    var in_dom = this._getDomNode();
    	var cmp_dom_node = in_dom || this;

    	try {
    		var _renderedFragRootNode = this._renderedFrag.firstElementChild; 

	        if(cmp_dom_node.isEqualNode(_renderedFragRootNode)){
	        	return;
	        }

	        if(in_dom && in_dom.attributes.renderonlyonce) {
		      	console.log("imp:", "Not patching dom - as renderonlyonce declared in rootNode");
		        in_dom.dataset.state = this.current_state;
		        // only patch style in this case
		        var _indomStyle = in_dom.querySelector('style');
		        var _renderedStyle = this._renderedFrag.querySelector('style');
		        if(_renderedStyle && !_indomStyle.isEqualNode(_renderedStyle)){
		        	_indomStyle.replaceWith(_renderedStyle);
		        }
		      	return;
		    }

	        if(_renderedFragRootNode.children.length==0){
	        	cmp_dom_node.replaceWith(this._renderedFrag);
	        	return;
	        }

	        if (in_dom && cmp_dom_node.children.length == _renderedFragRootNode.children.length) {
		        this.__findAndReplaceUnequalNodes(_renderedFragRootNode, cmp_dom_node);
		        return;
		    }

	     	//    if(cmp_dom_node.children.length == _renderedFragRootNode.children.length && in_dom){
	     	//    	// this.__findAndReplaceUnequalNodes(_renderedFragRootNode, cmp_dom_node);
		    //     Array.from(_renderedFragRootNode.children).forEach((_renderedFragChild, idx) => {
		    //       	var cmpDOMFragChild = cmp_dom_node.children[idx];
			   //      if (!cmpDOMFragChild.isEqualNode(_renderedFragChild) && !cmpDOMFragChild.attributes.renderonlyonce && !cmpDOMFragChild.constructedFrom) {
			   //          //this would in its current state skip patching some changes like event listeners addded via javascript.
			   //          cmp_dom_node.replaceChild(_renderedFragChild, cmpDOMFragChild);
			   //      }
			   //  });
		    // }

		    else{
		    	this.__processConditionalMarkup();
	        	cmp_dom_node.replaceWith(this._renderedFrag);
	      	}
    	}catch(e){
    		this._log("imp:","(ERROR) - component rendering failed with the following error - \n", e);
    	}

    	// try{
    	// 	var _renderedFragRootNode = this._renderedFrag.firstElementChild; 
	    //     // cmp_dom_node.outerHTML = _rendered;
	    //     if(cmp_dom_node.isEqualNode(_renderedFragRootNode)){return;}

	    //     // console.log("imp:", cmp_dom_node.children.length, " ?==? ", this._renderedFrag.firstElementChild.children.length);

	    //     if(cmp_dom_node.children.length == _renderedFragRootNode.children.length && this._getDomNode()){
		   //      Array.from(_renderedFragRootNode.children).forEach((_renderedFragChild, idx)=>{
		   //      	var cmpDOMFragChild = cmp_dom_node.children[idx];
		   //      	if(!cmpDOMFragChild.isEqualNode(_renderedFragChild)){  //this would in its current state skip patching some changes like event listeners addded via javascript.
		   //      		cmp_dom_node.replaceChild(_renderedFragChild, cmpDOMFragChild);	
		   //      	}
		   //      });
		   //  }else{
	    //     	cmp_dom_node.replaceWith(this._renderedFrag);
	    //   	}
	    //   	// this._log("imp:","cmpdomnode = ", cmp_dom_node);
	    // }catch(e){
	    //   this._log("imp:","(ERROR) - component rendering failed with the following error - \n", e);
	    // }
    }

  	render() { //called from either - 1.) datasrcupdate, 2.) datasrc is null after init, 3.) onattributechange, 4.) stateChange
	    this._log("----------rendering component start---------------");
	    var _this = this;

	    try{
	      var _rendered = this.markupFunc(this.data, this.uid, this.uiVars, this.constructor); 
	    }catch(e){
	      this._log("imp:", "error in rendering component - ", e);
	      return;
	    }
	    // this.shadow.innerHTML = _rendered;
	    // this._log("imp:","rendered markupFunc");
	    this._renderedFrag = stringToHTMLFrag(_rendered);
	    // this._log("imp:","rendered fragment");

	    // this._processChildCmps();

	    this.__processRootMarkup();

	    this.__processStyleMarkup();

	    this.__processRenderedFragEventListeners();
	    // this._log("imp:","renderered fragment uid");
	    
	    this.__patchDOM();

	    TRASH_SCOPE.debugLastRenderedCmp = this;
	    this._log("----------rendering component end-----------------");
	    
	    return this
  	}
	
}

DOMComponent.prototype._binding = function(b) {
    var _this = this;
    this.element = b.element;    
    this.value = b.object[b.property];
    this.attribute = b.attribute;
    this.valueGetter = function(){
        return _this.value;
    }
    this.valueSetter = function(val){
        _this.value = val;
        _this.element[_this.attribute] = val;
    }

    Object.defineProperty(b.object, b.property, {
        get: this.valueGetter,
        set: this.valueSetter
    }); 
    b.object[b.property] = this.value;

    this.element[this.attribute] = this.value;
}


DOMComponent._composeSelf = function(){
	DOMComponentRegistry.register(this.prototype.constructor);
}

DOMComponent._compose = function(){
	this.prototype.constructor._composeSelf();
}

Object.defineProperty(DOMComponent, "compose", { //what if 2 parents are composing the same child
	get: function(){return this._compose},
	set: function(composeFunc){ 
			this._compose = function(){
			// console.log("imp:","Updating Compose function of component ",this);
			this.prototype.constructor._composeSelf();
			composeFunc.call(this);
		} 
	}
});


export {
	DOMComponent,
	PostOffice,
	DataSource,
	DOMComponentRegistry
}