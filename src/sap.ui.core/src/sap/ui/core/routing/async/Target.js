/*!
 * ${copyright}
 */
sap.ui.define([
	"sap/base/Log",
	"sap/ui/core/ComponentContainer",
	"sap/ui/core/library"
], function(Log, ComponentContainer, coreLib) {
	"use strict";

	/**
	 * Provide methods for sap.ui.core.routing.Target in async mode
	 * @private
	 * @experimental
	 * @since 1.33
	 */
	return {

		/**
		 * Creates a view and puts it in an aggregation of a control that has been defined in the {@link #constructor}.
		 *
		 * @param {*} [vData] an object that will be passed to the display event in the data property. If the target has parents, the data will also be passed to them.
		 * @return {Promise} resolves with {name: *, view: *, control: *} if the target can be successfully displayed otherwise it rejects with error information
		 * @private
		 */
		display : function (vData) {
			// Create an immediately resolving promise for parentless Target
			var oSequencePromise = Promise.resolve();
			return this._display(vData, oSequencePromise);
		},

		/**
		 * @private
		 */
		_display: function (vData, oSequencePromise, oTargetCreateInfo) {
			if (this._oParent) {
				// replace the sync
				oSequencePromise = this._oParent._display(vData, oSequencePromise, oTargetCreateInfo);
			}

			return this._place(vData, oSequencePromise, oTargetCreateInfo);
		},

		/**
		 * Here the magic happens - recursion + placement + view creation needs to be refactored
		 *
		 * @param {object} [vData] an object that will be passed to the display event in the data property. If the
		 * 		target has parents, the data will also be passed to them.
		 * @param {Promise} oSequencePromise Promise chain for resolution in the correct order
		 * @return {Promise} resolves with {name: *, view: *, control: *} if the target can be successfully displayed otherwise it rejects with an error message
		 * @private
		 */
		_place : function (vData, oSequencePromise, oTargetCreateInfo) {
			if (vData instanceof Promise) {
				oTargetCreateInfo = oSequencePromise;
				oSequencePromise = vData;
				vData = undefined;
			}

			var oOptions = this._oOptions,
				that = this,
				oObject, sName, oCreateOptions, sErrorMessage, pLoaded;

			if ((oOptions.name || oOptions.usage) && oOptions.type) {
				// when view information is given
				sName = this._getEffectiveObjectName(oOptions.name);
				switch (oOptions.type) {
					case "View":
						oCreateOptions = {
							name: sName,
							type: oOptions.viewType,
							id: oOptions.id,
							async: true
						};
						break;
					case "Component":
						oCreateOptions = { id: oOptions.id };

						if (oOptions.usage) {
							oCreateOptions.usage = oOptions.usage;
						} else {
							oCreateOptions.name = sName;
						}

						oCreateOptions = Object.assign({}, oOptions.options || {}, oCreateOptions);
						break;
					default:
						throw new Error("The given type " + oOptions.type + " isn't support by sap.ui.core.routing.Target");
				}

				oObject = this._oCache._get(oCreateOptions, oOptions.type,
						// Hook in the route for deprecated global view id, it has to be supported to stay compatible
						this._bUseRawViewId, oTargetCreateInfo);

				if (!(oObject instanceof Promise)) {
					if (oObject.isA("sap.ui.core.mvc.View")) {
						pLoaded = oObject.loaded();
					} else {
						pLoaded = Promise.resolve(oObject);
					}
				} else {
					pLoaded = oObject;
				}

				oSequencePromise = oSequencePromise
					.then(function(oParentInfo) {
						return pLoaded
							.then(function (oObject) {
								if (oObject.isA("sap.ui.core.UIComponent")) {
									var oRouter = oObject.getRouter();
									if (oRouter && oRouter.isStopped()) {
										// initialize the router in nested component
										// if it has been previously stopped
										oRouter.initialize();
									}
								}
								return {
									object: oObject,
									parentInfo: oParentInfo || {}
								};
							});
					})
					.then(function(oViewInfo) {
						// loaded and do placement
						var vValid = that._isValid(oViewInfo.parentInfo);

						oObject = oViewInfo.object;

						// TODO: check how to handle the title change for the loaded component
						if (oObject.isA("sap.ui.core.mvc.View")) {
							that._bindTitleInTitleProvider(oObject);
							that._addTitleProviderAsDependent(oObject);
						}

						// validate config and log errors if necessary
						if (vValid !== true) {
							sErrorMessage = vValid;
							return that._refuseInvalidTarget(oOptions._name, sErrorMessage);
						}

						var oViewContainingTheControl = oViewInfo.parentInfo.view,
							oControl = oViewInfo.parentInfo.control,
							pContainerControl = Promise.resolve(oControl);

						// if the parent target loads a component, the oViewContainingTheControl is an instance of
						// ComponentContainer. The root control of the component should be retrieved and set as
						// oViewContainingTheControl
						if (oViewContainingTheControl && oViewContainingTheControl.isA("sap.ui.core.ComponentContainer")) {
							oViewContainingTheControl = oViewContainingTheControl.getComponentInstance().getRootControl();
						}

						//no parent view - see if there is a targetParent in the config
						if (!oViewContainingTheControl && oOptions.rootView) {
							oViewContainingTheControl = sap.ui.getCore().byId(oOptions.rootView);

							if (!oViewContainingTheControl) {
								sErrorMessage = "Did not find the root view with the id " + oOptions.rootView;
								return that._refuseInvalidTarget(oOptions._name, sErrorMessage);
							}
						}

						// Find the control in the parent
						if (oOptions.controlId) {
							// The root control of a component may be any kind of control
							// A check of sap.ui.core.View is needed before calling the loaded method to wait
							// for the loading of the view
							if (oViewContainingTheControl && oViewContainingTheControl.isA("sap.ui.core.mvc.View")) {
								// controlId was specified - ask the parents view for it
								// wait for the parent view to be loaded in case it's loaded async
								pContainerControl = oViewContainingTheControl.loaded().then(function(oContainerView) {
									return oContainerView.byId(oOptions.controlId);
								});
							}

							pContainerControl = pContainerControl.then(function(oContainerControl) {
								if (!oContainerControl) {
									//Test if control exists in core (without prefix) since it was not found in the parent or root view
									oContainerControl =  sap.ui.getCore().byId(oOptions.controlId);
								}

								if (!oContainerControl) {
									sErrorMessage = "Control with ID " + oOptions.controlId + " could not be found";
									return that._refuseInvalidTarget(oOptions._name, sErrorMessage);
								} else {
									return oContainerControl;
								}
							});
						}

						return pContainerControl;
					})
					.then(function(oContainerControl) {
						var oComponent,
							sComponentContainerId,
							fnOriginalExit;

						if (oObject.isA("sap.ui.core.UIComponent")) {
							oComponent = oObject;
							sComponentContainerId = oComponent.getId() + "-container";
							oObject = sap.ui.getCore().byId(sComponentContainerId);

							if (!oObject) {
								// defaults mixed in with configured settings
								var oContainerOptions = Object.assign({
									component: oComponent,
									height: "100%",
									width: "100%",
									lifecycle: sap.ui.core.ComponentLifecycle.Application
								}, oOptions.containerOptions);

								oObject = new ComponentContainer(sComponentContainerId, oContainerOptions);

								fnOriginalExit = oComponent.exit;
								oComponent.exit = function () {
									if (fnOriginalExit) {
										fnOriginalExit.apply(this);
									}

									// destroy the component container when the component is destroyed
									oObject.destroy();
								};
							}
						}

						// adapt the container before placing the view into it to make the rendering occur together with the next
						// aggregation modification.
						that._beforePlacingViewIntoContainer({
							container: oContainerControl,
							view: oObject,
							data: vData
						});

						var oAggregationInfo = oContainerControl.getMetadata().getJSONKeys()[oOptions.controlAggregation];

						if (!oAggregationInfo) {
							sErrorMessage = "Control " + oOptions.controlId + " does not have an aggregation called " + oOptions.controlAggregation;
							return that._refuseInvalidTarget(oOptions._name, sErrorMessage);
						}

						if (oOptions.clearControlAggregation === true) {
							oContainerControl[oAggregationInfo._sRemoveAllMutator]();
						}

						Log.info("Did place the " + oOptions.type.toLowerCase() + " '" + sName + "' with the id '" + oObject.getId() + "' into the aggregation '" + oOptions.controlAggregation + "' of a control with the id '" + oContainerControl.getId() + "'", that);
						oContainerControl[oAggregationInfo._sMutator](oObject);

						that.fireDisplay({
							view : oObject.isA("sap.ui.core.mvc.View") ? oObject : undefined,
							object: oObject,
							control : oContainerControl,
							config : that._oOptions,
							data: vData
						});

						return {
							name: oOptions._name,
							view: oObject,
							control: oContainerControl
						};
					});
			} else {
				oSequencePromise = oSequencePromise.then(function() {
					return {
						name: oOptions._name
					};
				});
			}

			return oSequencePromise;
		},

		/**
		 * Validates the target options, will also be called from the route but route will not log errors
		 *
		 * @param oParentInfo
		 * @returns {boolean|string} returns true if it's valid otherwise the error message
		 * @private
		 */
		_isValid : function (oParentInfo) {
			var oOptions = this._oOptions,
				oControl = oParentInfo && oParentInfo.control,
				bHasTargetControl = (oControl || oOptions.controlId),
				bIsValid = true,
				sLogMessage = "";

			if (!bHasTargetControl) {
				sLogMessage = "The target " + oOptions._name + " has no controlId set and no parent so the target cannot be displayed.";
				bIsValid = false;
			}

			if (!oOptions.controlAggregation) {
				sLogMessage = "The target " + oOptions._name + " has a control id or a parent but no 'controlAggregation' was set, so the target could not be displayed.";
				bIsValid = false;
			}

			if (sLogMessage) {
				Log.error(sLogMessage, this);
			}

			return bIsValid || sLogMessage;
		},

		/**
		 * @private
		 */
		_refuseInvalidTarget : function(sName, sMessage) {
			return Promise.reject(new Error(sMessage + " - Target: " + sName));
		}
	};
});
