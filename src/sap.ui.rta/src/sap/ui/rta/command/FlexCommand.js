/*!
 * ${copyright}
 */
sap.ui.define([
	"sap/ui/rta/command/BaseCommand",
	"sap/ui/rta/ControlTreeModifier",
	"sap/ui/core/util/reflection/JsControlTreeModifier",
	"sap/ui/fl/Utils",
	"sap/base/Log",
	"sap/base/util/merge",
	"sap/ui/fl/write/api/ChangesWriteAPI",
	"sap/ui/fl/write/api/PersistenceWriteAPI"
], function(
	BaseCommand,
	RtaControlTreeModifier,
	JsControlTreeModifier,
	flUtils,
	Log,
	merge,
	ChangesWriteAPI,
	PersistenceWriteAPI
) {
	"use strict";

	/**
	 * Basic implementation for the flexibility commands, that use a flex change handler.
	 *
	 * @class
	 * @extends sap.ui.rta.command.BaseCommand
	 *
	 * @author SAP SE
	 * @version ${version}
	 *
	 * @constructor
	 * @private
	 * @since 1.34
	 * @alias sap.ui.rta.command.FlexCommand
	 * @experimental Since 1.34. This class is experimental and provides only limited functionality. Also the API might be
	 *               changed in future.
	 */
	var FlexCommand = BaseCommand.extend("sap.ui.rta.command.FlexCommand", {
		metadata : {
			library : "sap.ui.rta",
			properties : {
				changeType : {
					type : "string"
				},
				/**
				 * Change can only be applied on js, other modifiers like xml will not work
				 */
				jsOnly : {
					type : "boolean"
				},
				/**
				 * selector object containing id, appComponent and controlType to create a command for an element, which is not instantiated
				 */
				selector : {
					type : "object"
				}
			},
			associations : {},
			events : {}
		}
	});

	/**
	 * Retrieves id of element or selector
	 *
	 * @returns {string} id value
	 * @public
	 */
	FlexCommand.prototype.getElementId = function() {
		var oElement = this.getElement();
		return oElement ? oElement.getId() : this.getSelector().id;
	};

	/**
	 * Retrieves app component of element or selector
	 *
	 * @returns {sap.ui.core.UIComponent} component
	 * @private
	 */
	FlexCommand.prototype.getAppComponent = function() {
		var oElement = this.getElement();
		return oElement ? flUtils.getAppComponentForControl(oElement) : this.getSelector().appComponent;
	};

	/**
	 * Prepares and stores change to be applied later
	 * (in some cases element of a command is unstable, so change needs to be created and stored upfront)
	 * @override
	 */
	FlexCommand.prototype.prepare = function(mFlexSettings, sVariantManagementReference) {
		var oSelector;
		if (!this.getSelector() && mFlexSettings && mFlexSettings.templateSelector) {
			oSelector = {
				id: mFlexSettings.templateSelector,
				appComponent: this.getAppComponent(),
				controlType: flUtils.getControlType(sap.ui.getCore().byId(mFlexSettings.templateSelector))
			};
			this.setSelector(oSelector);
		} else if (!this.getSelector() && this.getElement()) {
			oSelector = {
				id: this.getElement().getId(),
				appComponent: this.getAppComponent(),
				controlType: flUtils.getControlType(this.getElement())
			};
			this.setSelector(oSelector);
		}
		try {
			this._oPreparedChange = this._createChange(mFlexSettings, sVariantManagementReference);
		} catch (oError) {
			Log.error(oError.message || oError.name);
			return false;
		}
		return true;
	};

	/**
	 * Returns a prepared change if exists in the command
	 * @returns {object} Prepared change object
	 * @public
	 */
	FlexCommand.prototype.getPreparedChange = function() {
		return this._oPreparedChange;
	};

	/**
	 * @override
	 * @returns {Promise} empty promise after finishing execution
	 */
	FlexCommand.prototype.execute = function() {
		var vChange = this.getPreparedChange();
		return this._applyChange(vChange);
	};

	/**
	 * This method converts command constructor parameters into change specific data.
	 * Default implementation of this method below is for commands, which do not have specific constructor parameters
	 * @return {object} Returns the <code>SpecificChangeInfo</code> for change handler
	 * @protected
	 */
	FlexCommand.prototype._getChangeSpecificData = function() {
		return {
			changeType : this.getChangeType(),
			selector : {
				id : this.getElementId()
			}
		};
	};

	/**
	 * Creates a change.
	 * @param {object} mFlexSettings Map containing the flexibility settings
	 * @param {string} sVariantManagementReference Reference to the variant management
	 * @returns {object} Returns the change object
	 * @private
	 */
	FlexCommand.prototype._createChange = function(mFlexSettings, sVariantManagementReference) {
		return this._createChangeFromData(this._getChangeSpecificData(), mFlexSettings, sVariantManagementReference);
	};

	/**
	 * Create a Flex change from a given Change Specific Data.
	 * (This method can be reused to retrieve an Undo Change)
	 *
	 * @param {object} mChangeSpecificData Map containing change specific data
	 * @param {object} mFlexSettings Map containing flex settings
	 * @param {string} sVariantManagementReference Reference to the variant management
	 * @returns {object} Returns the change object
	 * @private
	 */
	FlexCommand.prototype._createChangeFromData = function(mChangeSpecificData, mFlexSettings, sVariantManagementReference) {
		if (mFlexSettings) {
			mChangeSpecificData = merge({}, mChangeSpecificData, mFlexSettings);
		}
		mChangeSpecificData.jsOnly = this.getJsOnly();
		var oModel = this.getAppComponent().getModel(flUtils.VARIANT_MODEL_NAME);
		var sVariantReference;
		if (oModel && sVariantManagementReference) {
			sVariantReference = oModel.getCurrentVariantReference(sVariantManagementReference);
		}
		var mVariantObj = {
			variantManagementReference: sVariantManagementReference,
			variantReference: sVariantReference
		};
		if (sVariantReference) {
			mChangeSpecificData = Object.assign({}, mChangeSpecificData, mVariantObj);
		}
		var oChange = ChangesWriteAPI.create(mChangeSpecificData, this._validateControlForChange(mFlexSettings));
		if (mFlexSettings && mFlexSettings.originalSelector) {
			oChange.addDependentControl(mFlexSettings.originalSelector, "originalSelector", {modifier: JsControlTreeModifier, appComponent: this.getAppComponent()});
			oChange.getDefinition().selector = JsControlTreeModifier.getSelector(this.getSelector().id, this.getSelector().appComponent);
			oChange.setContent(Object.assign({}, oChange.getContent(), mFlexSettings.content));
		}
		return oChange;
	};

	/**
	 * @override
	 */
	FlexCommand.prototype.undo = function() {
		function enhanceErrorMessage(sMessage, vControl) {
			var sControlType = vControl.controlType ? vControl.controlType : JsControlTreeModifier.getControlType(vControl);
			var sErrorMessage = "Undo is not possible for control type: " + sControlType + ". Reason: " + sMessage;
			return sErrorMessage;
		}

		return Promise.resolve()
		.then(function() {
			var vControl = this.getElement() || this.getSelector();
			var oChange = this.getPreparedChange();

			if (oChange.getRevertData()) {
				var bRevertible = ChangesWriteAPI.isChangeHandlerRevertible(oChange, vControl);
				if (!bRevertible) {
					Log.error(enhanceErrorMessage("No revert change function available to handle revert data.", vControl));
					return;
				}
				return PersistenceWriteAPI.remove(oChange, {appComponent: this.getAppComponent(true), revert: true});
			} else if (this._aRecordedUndo) {
				RtaControlTreeModifier.performUndo(this._aRecordedUndo);
			} else {
				Log.error(enhanceErrorMessage("Undo is not available.", vControl));
			}
		}.bind(this));
	};

	/**
	 * @private
	 * @param {sap.ui.fl.Change|Object} vChange Change object or map containing the change object
	 * @returns {Promise} Returns an empty promise
	 */
	FlexCommand.prototype._applyChange = function(vChange) {
		//TODO: remove the following compatibility code when concept is implemented
		var oChange = vChange.change || vChange;

		var oAppComponent = this.getAppComponent();
		var oSelectorElement = RtaControlTreeModifier.bySelector(oChange.getSelector(), oAppComponent);
		var mControl = ChangesWriteAPI.getControlIfTemplateAffected(oSelectorElement, {
			modifier: JsControlTreeModifier,
			appComponent: oAppComponent,
			change: oChange
		});
		var bRevertible = ChangesWriteAPI.isChangeHandlerRevertible(oChange, mControl.control);
		var mPropertyBag = {
			modifier: bRevertible ? JsControlTreeModifier : RtaControlTreeModifier,
			appComponent: oAppComponent,
			view: flUtils.getViewForControl(oSelectorElement)
		};

		if (!bRevertible) {
			RtaControlTreeModifier.startRecordingUndo();
		}

		return Promise.resolve()

		.then(function() {
			return ChangesWriteAPI.apply(oChange, oSelectorElement, mPropertyBag);
		})

		.then(function(oResult) {
			if (!bRevertible) {
				if (!oChange.getUndoOperations()) {
					this._aRecordedUndo = RtaControlTreeModifier.stopRecordingUndo();
				} else {
					this._aRecordedUndo = oChange.getUndoOperations();
					oChange.resetUndoOperations();
				}
			}
			if (!oResult.success) {
				return Promise.reject(oResult.error);
			}
		}.bind(this));
	};

	FlexCommand.prototype._validateControlForChange = function(mFlexSettings) {
		if (mFlexSettings && mFlexSettings.originalSelector && mFlexSettings.content && mFlexSettings.content.boundAggregation) {
			return {
				id: mFlexSettings.originalSelector,
				appComponent: this.getAppComponent(),
				controlType: flUtils.getControlType(sap.ui.getCore().byId(mFlexSettings.originalSelector))
			};
		}
		return this.getElement() || this.getSelector();
	};

	return FlexCommand;
}, /* bExport= */true);