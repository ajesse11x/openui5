/* global QUnit*/

sap.ui.define([
	"sap/ui/fl/Change",
	"sap/ui/fl/Utils",
	"sap/ui/fl/registry/Settings",
	"sap/ui/base/EventProvider",
	"sap/ui/core/util/reflection/JsControlTreeModifier",
	"sap/ui/core/Control",
	"sap/ui/thirdparty/jquery",
	"sap/ui/thirdparty/sinon-4"
],
function(
	Change,
	Utils,
	Settings,
	EventProvider,
	JsControlTreeModifier,
	Control,
	jQuery,
	sinon
) {
	"use strict";

	var sandbox = sinon.sandbox.create();

	QUnit.module("sap.ui.fl.Change", {
		beforeEach: function() {
			this.ushellStore = sap.ushell; // removes the lib for a pure OpenUI5 testing
			this.oControl = {};
			this.sUserId = "cookieMonster";
			this.oChangeDef = {
				fileName: "0815_1",
				namespace: "apps/smartFilterBar/changes/",
				projectId: "myProject",
				packageName: "$TMP",
				fileType: "variant",
				layer: "VENDOR",
				changeType: "filterVariant",
				reference: "smartFilterBar",
				componentName: "smartFilterBar",
				selector: {
					id: "control1",
					idIsLocal: true
				},
				conditions: {},
				context: [],
				content: {something: "createNewVariant"},
				texts: {
					variantName: {
						value: "myVariantName",
						type: "myTextType"
					}
				},
				originalLanguage: "DE",
				support: {
					generator: "Dallas beta 1",
					user: this.sUserId
				},
				oDataPropertyInformation: {
					propertyName: "propertyName",
					entityType: "entityType",
					oDataServiceUri: "oDataServiceUri"
				},
				dependentSelector: {
					source: {
						id: "controlSource1",
						idIsLocal: true
					},
					target: {
						id: "controlTarget1",
						idIsLocal: true
					}
				},
				validAppVersions: {
					creation: "1.0.0",
					from: "1.0.0"
				}
			};

			sandbox.stub(Utils, "getCurrentLayer").returns("VENDOR");
		},
		afterEach: function() {
			sap.ushell = this.ushellStore;
			sandbox.restore();
		}
	}, function() {
		QUnit.test("constructor ", function(assert) {
			var oInstance = new sap.ui.fl.Change(this.oChangeDef);
			assert.ok(oInstance);
		});

		QUnit.test("Shall inherit from EventProvider", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.ok(oInstance instanceof EventProvider, "Shall inherit from event provider");
		});

		QUnit.test("Change.get/set/resetUndoOperations", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getUndoOperations(), null, "initially undoOperations is null");

			oInstance.setUndoOperations([1, 2]);
			assert.equal(oInstance.getUndoOperations().length, 2, "an array with length 2 was set");

			oInstance.setUndoOperations([1, 2, 3]);
			assert.equal(oInstance.getUndoOperations().length, 3, "an array with length 3 was set");

			oInstance.resetUndoOperations();
			assert.equal(oInstance.getUndoOperations(), null, "the undoOperations were reset to null");
		});

		QUnit.test("Change.applyState", function(assert) {
			var oChange = new Change(this.oChangeDef);
			assert.equal(oChange.getProperty("applyState"), Change.applyState.INITIAL, "initially the state is INITIAL");

			oChange.setQueuedForApply();
			oChange.startApplying();
			assert.equal(oChange.getProperty("applyState"), Change.applyState.APPLYING, "the applyState got changed correctly");
			assert.ok(oChange.hasApplyProcessStarted(), "the function returns the correct value");
			assert.notOk(oChange.isCurrentProcessFinished());
			assert.notOk(oChange.isQueuedForRevert());
			assert.ok(oChange.isQueuedForApply());

			oChange.markFinished();
			assert.equal(oChange.getProperty("applyState"), Change.applyState.APPLY_FINISHED, "the applyState got changed correctly");
			assert.ok(oChange.isApplyProcessFinished(), "the function returns the correct value");
			assert.ok(oChange.isCurrentProcessFinished());
			assert.notOk(oChange.isQueuedForRevert());
			assert.notOk(oChange.isQueuedForApply());

			oChange.setQueuedForRevert();
			oChange.startReverting();
			assert.equal(oChange.getProperty("applyState"), Change.applyState.REVERTING, "the applyState got changed correctly");
			assert.ok(oChange.hasRevertProcessStarted(), "the function returns the correct value");
			assert.notOk(oChange.isCurrentProcessFinished());
			assert.ok(oChange.isQueuedForRevert());
			assert.notOk(oChange.isQueuedForApply());

			oChange.markRevertFinished();
			assert.equal(oChange.getProperty("applyState"), Change.applyState.REVERT_FINISHED, "the applyState got changed correctly");
			assert.ok(oChange.isRevertProcessFinished(), "the function returns the correct value");
			assert.ok(oChange.isCurrentProcessFinished());
			assert.notOk(oChange.isQueuedForRevert());
			assert.notOk(oChange.isQueuedForApply());
		});

		QUnit.test("ChangeProcessingPromise: resolve", function(assert) {
			var done = assert.async();
			var oChange = new Change(this.oChangeDef);
			var oPromise = oChange.addPromiseForApplyProcessing();
			var oPromise2 = oChange.addChangeProcessingPromise(Change.operations.REVERT);

			Promise.all([oPromise, oPromise2])
			.then(function() {
				assert.ok(true, "the function resolves");
				done();
			});

			oChange.markFinished();
			oChange.markRevertFinished();
		});

		QUnit.test("ChangeProcessingPromise: reject", function(assert) {
			var done = assert.async();
			var oChange = new Change(this.oChangeDef);
			var oPromise = oChange.addPromiseForApplyProcessing();
			var oPromise2 = oChange.addChangeProcessingPromise(Change.operations.REVERT);

			Promise.all([oPromise, oPromise2])
			.then(function() {
				assert.ok(true, "the promises were resolved");
				done();
			});

			oChange.markFinished();
			oChange.markRevertFinished();
		});

		QUnit.test("ChangeProcessingPromise: addChangeProcessingPromises", function(assert) {
			var done = assert.async();
			var oChange = new Change(this.oChangeDef);
			oChange.setQueuedForApply();
			oChange.setQueuedForRevert();

			var aPromises = oChange.addChangeProcessingPromises();
			assert.equal(aPromises.length, 2, "two promises got added");

			Promise.all(aPromises)
			.then(function() {
				assert.ok(true, "the function resolves");
				done();
			});

			oChange.markFinished();
			oChange.markRevertFinished();
		});

		QUnit.test("Change.isVariant", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.isVariant(), true);
		});

		QUnit.test("Change.getChangeType", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getChangeType(), "filterVariant");
		});

		QUnit.test("Change.getFileType", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getFileType(), "variant");
		});

		QUnit.test("Change.getFileName", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getFileName(), "0815_1");
		});

		QUnit.test("Change.getPackage", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getPackage(), "$TMP");
		});

		QUnit.test("getNamespace should return the namespace of the defintion", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.strictEqual(oInstance.getNamespace(), "apps/smartFilterBar/changes/");
		});

		QUnit.test("setNamespace should set the namespace of the definition", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			oInstance.setNamespace("apps/ReferenceAppId/changes/");
			assert.strictEqual(oInstance.getNamespace(), "apps/ReferenceAppId/changes/");
		});

		QUnit.test("getProjectId should return the projectId in the definition", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.strictEqual(oInstance.getProjectId(), "myProject");
		});

		QUnit.test("setProjectId should set the projectId in the definition", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			oInstance.setProjectId("otherProject");
			assert.strictEqual(oInstance.getProjectId(), "otherProject");
		});

		QUnit.test("setComponent should set the reference of the definition", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			oInstance.setComponent("AppVariantId");
			assert.strictEqual(oInstance.getComponent(), "AppVariantId");
		});

		QUnit.test("Change.getId", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getId(), "0815_1");
		});

		QUnit.test("Change.getContent", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.ok(oInstance.getContent());
		});

		QUnit.test("Change.setState with an incorrect value", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getPendingAction(), "NEW");
			oInstance.setState("anInvalidState");
			assert.equal(oInstance.getPendingAction(), "NEW");
		});

		QUnit.test("Change.setState to DIRTY when current state is NEW", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getPendingAction(), "NEW");
			oInstance.setState(Change.states.DIRTY);
			assert.equal(oInstance.getPendingAction(), "NEW");
		});

		QUnit.test("Change.setState to DIRTY when current state is PERSISTED", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getPendingAction(), "NEW");
			oInstance.setState(Change.states.PERSISTED);
			oInstance.setState(Change.states.DIRTY);
			assert.equal(oInstance.getPendingAction(), "UPDATE");
		});

		QUnit.test("Change.setContent", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getPendingAction(), "NEW");
			oInstance.setContent({something: "nix"});
			assert.deepEqual(oInstance.getContent(), {something: "nix"});
			assert.equal(oInstance.getPendingAction(), "NEW");
			oInstance.setState(Change.states.PERSISTED);
			oInstance.setContent({something: "updated"});
			assert.deepEqual(oInstance.getContent(), {something: "updated"});
			assert.equal(oInstance.getPendingAction(), "UPDATE");
		});

		QUnit.test("Change.getContext", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.ok(oInstance.getContext());
		});

		QUnit.test("Change.getText", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getText('variantName'), 'myVariantName');
		});

		QUnit.test("Change.setText", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			oInstance.setText('variantName', 'newText');
			assert.equal(oInstance.getText('variantName'), 'newText');
			assert.equal(oInstance.getPendingAction(), "NEW");
			oInstance.setState(Change.states.PERSISTED);
			oInstance.setText('variantName', 'myVariantName');
			assert.equal(oInstance.getState(), Change.states.DIRTY);
		});

		QUnit.test("Change._isReadOnlyDueToLayer", function(assert) {
			// check for different layer
			this.oChangeDef.layer = "CUSTOMER";
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance._isReadOnlyDueToLayer(), true);
			// check for same layer
			this.oChangeDef.layer = "VENDOR";
			oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance._isReadOnlyDueToLayer(), false);
		});

		QUnit.test("Change.markForDeletion", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			oInstance.markForDeletion();
			assert.equal(oInstance.getPendingAction(), "DELETE");
		});

		QUnit.test("Change.set/get-Request", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			oInstance.setRequest('test');

			assert.equal(oInstance.getRequest(), 'test');
		});

		QUnit.test("Change.getLayer", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getLayer(), "VENDOR");
		});

		QUnit.test("Change.getComponent", function(assert) {
			var oChange, sComponent;
			oChange = new Change(this.oChangeDef);
			sComponent = oChange.getComponent();
			assert.equal(sComponent, "smartFilterBar");
		});

		QUnit.test("Change.isUserDependent", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.ok(!oInstance.isUserDependent());
		});

		QUnit.test("Change.getPendingChanges", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.equal(oInstance.getPendingAction(), Change.states.NEW);
			oInstance.setState(Change.states.PERSISTED);

			oInstance.setContent({});
			assert.equal(oInstance.getPendingAction(), Change.states.DIRTY);

			oInstance.markForDeletion();
			assert.equal(oInstance.getPendingAction(), Change.states.DELETED);
		});

		QUnit.test("Change.getDefinition", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.ok(oInstance.getDefinition());
		});

		QUnit.test("createInitialFileContent", function(assert) {
			var oInfo = {
				service: "someService",
				reference: "smartFilterBar.Component",
				componentName: "smartFilterBar",
				changeType: "filterVariant",
				texts: {
					variantName: {
						type: "myTextType",
						value: "myVariantName"
					}
				},
				content: {something: "createNewVariant"},
				isVariant: true,
				packageName: "/UIF/LREP",
				namespace: "apps/smartFilterBar/adapt/oil/changes/",
				selector: {id: "control1"},
				id: "0815_1",
				dependentSelector: {
					source: {
						id: "controlSource1",
						idIsLocal: true
					},
					target: {
						id: "controlTarget1",
						idIsLocal: true
					}
				},
				validAppVersions: {
					creation: "1.0.0",
					from: "1.0.0",
					to: "1.0.0"
				},
				oDataInformation: {
					propertyName: "propertyName",
					entityType: "entityType",
					oDataServiceUri: "oDataServiceUri"
				},
				jsOnly: true
			};

			var oCreatedFile = Change.createInitialFileContent(oInfo);

			assert.equal(oCreatedFile.reference, "smartFilterBar.Component");
			assert.equal(oCreatedFile.fileName, "0815_1");
			assert.equal(oCreatedFile.changeType, "filterVariant");
			assert.equal(oCreatedFile.fileType, "variant");
			assert.equal(oCreatedFile.namespace, "apps/smartFilterBar/adapt/oil/changes/");
			assert.equal(oCreatedFile.projectId, "smartFilterBar");
			assert.equal(oCreatedFile.packageName, "/UIF/LREP");
			assert.equal(oCreatedFile.support.generator, "Change.createInitialFileContent");
			assert.deepEqual(oCreatedFile.content, {something: "createNewVariant"});
			assert.deepEqual(oCreatedFile.texts, {variantName: {value: "myVariantName", type: "myTextType"}});
			assert.deepEqual(oCreatedFile.selector, {id: "control1"});
			assert.deepEqual(oCreatedFile.dependentSelector, {source: {id: "controlSource1", idIsLocal: true}, target: {id: "controlTarget1", idIsLocal: true}});
			assert.deepEqual(oCreatedFile.validAppVersions, {creation: "1.0.0", from: "1.0.0", to: "1.0.0"});
			assert.deepEqual(oCreatedFile.oDataInformation, {propertyName: "propertyName", entityType: "entityType", oDataServiceUri: "oDataServiceUri"});
			assert.ok(oCreatedFile.jsOnly);
		});

		QUnit.test("createInitialFileContent when generator is pre-set", function(assert) {
			var oInfo = {
				changeType: "filterVariant",
				content: {},
				namespace: "apps/smartFilterBar/adapt/oil/changes/",
				generator: "RTA"
			};

			var oCreatedFile = Change.createInitialFileContent(oInfo);

			assert.equal(oCreatedFile.support.generator, "RTA");
		});

		QUnit.test("createInitialFileContent when fileType is pre-set", function(assert) {
			var oInfo = {
				changeType: "filterVariant",
				content: {},
				namespace: "apps/smartFilterBar/adapt/oil/changes/",
				fileType: "newFileType"
			};

			var oCreatedFile = Change.createInitialFileContent(oInfo);

			assert.equal(oCreatedFile.fileType, "newFileType");
		});

		QUnit.test("createInitialFileContent when project id is pre-set", function(assert) {
			var oInfo = {
				changeType: "change",
				content: {},
				namespace: "apps/smartFilterBar/adapt/oil/changes/",
				projectId: "myProject"
			};

			var oCreatedFile = Change.createInitialFileContent(oInfo);

			assert.equal(oCreatedFile.projectId, "myProject");
		});

		QUnit.test("_isReadOnlyDueToOriginalLanguage shall compare the original language with the current language", function(assert) {
			var oChange, bIsReadOnly;
			oChange = new Change(this.oChangeDef);
			sandbox.stub(Utils, "getCurrentLanguage").returns("DE");

			//Call CUT
			bIsReadOnly = oChange._isReadOnlyDueToOriginalLanguage();

			assert.strictEqual(bIsReadOnly, false);
		});

		QUnit.test("setResponse shall set an object to the Change instance", function(assert) {
			//Arrange
			var sampleResponse = {
				fileName: "0815_1",
				fileType: "variant",
				changeType: "filterVariant",
				component: "smartFilterBar",
				content: {something: "createNewVariant"},
				selector: {id: "control1"},
				layer: "VENDOR",
				texts: {
					variantName: {
						value: "myVariantName",
						type: "myTextType"
					}
				},
				namespace: "localchange1/",
				creation: "2014-10-30T13:52:40.4754350Z",
				originalLanguage: "DE",
				conditions: {},
				support: {
					generator: "Dallas beta 1",
					user: this.sUserId
				}
			};

			var oChange = new Change(this.oChangeDef);
			assert.ok(!oChange._oDefinition.creation);
			assert.equal(oChange.getState(), Change.states.NEW);

			//Act
			oChange.setResponse(sampleResponse);

			//Assert
			assert.ok(oChange._oDefinition.creation, "2014-10-30T13:52:40.4754350Z");
			assert.equal(oChange.getState(), Change.states.PERSISTED);
		});

		QUnit.test("_isReadOnlyDueToOriginalLanguage shall be true if the original language is initial", function(assert) {
			var oChange, bIsReadOnly;
			this.oChangeDef.originalLanguage = "";
			oChange = new Change(this.oChangeDef);
			//Call CUT
			bIsReadOnly = oChange._isReadOnlyDueToOriginalLanguage();

			assert.strictEqual(bIsReadOnly, false);
		});

		QUnit.test("Change.isLabelReadOnly", function(assert) {
			var oChange;
			oChange = new Change(this.oChangeDef);

			oChange._isReadOnlyWhenNotKeyUser = sinon.stub().returns(false);

			//false false
			oChange._isReadOnlyDueToLayer = sinon.stub().returns(false);
			oChange._isReadOnlyDueToOriginalLanguage = sinon.stub().returns(false);
			assert.strictEqual(oChange.isReadOnly(), false);
			assert.strictEqual(oChange.isLabelReadOnly(), false);

			//true false
			oChange._isReadOnlyDueToLayer = sinon.stub().returns(true);
			oChange._isReadOnlyDueToOriginalLanguage = sinon.stub().returns(false);
			assert.strictEqual(oChange.isReadOnly(), true);
			assert.strictEqual(oChange.isLabelReadOnly(), true);

			//false true
			oChange._isReadOnlyDueToLayer = sinon.stub().returns(false);
			oChange._isReadOnlyDueToOriginalLanguage = sinon.stub().returns(true);
			assert.strictEqual(oChange.isReadOnly(), false);
			assert.strictEqual(oChange.isLabelReadOnly(), true);

			//true true
			oChange._isReadOnlyDueToLayer = sinon.stub().returns(true);
			oChange._isReadOnlyDueToOriginalLanguage = sinon.stub().returns(true);
			assert.strictEqual(oChange.isReadOnly(), true);
			assert.strictEqual(oChange.isLabelReadOnly(), true);
		});

		QUnit.test("Change.isReadOnly", function(assert) {
			var oChange;
			oChange = new Change(this.oChangeDef);

			//false false
			oChange._isReadOnlyDueToLayer = sinon.stub().returns(false);
			oChange._isReadOnlyWhenNotKeyUser = sinon.stub().returns(false);
			assert.strictEqual(oChange.isReadOnly(), false);

			//true false
			oChange._isReadOnlyDueToLayer = sinon.stub().returns(true);
			oChange._isReadOnlyWhenNotKeyUser = sinon.stub().returns(false);
			assert.strictEqual(oChange.isReadOnly(), true);

			//false true
			oChange._isReadOnlyDueToLayer = sinon.stub().returns(false);
			oChange._isReadOnlyWhenNotKeyUser = sinon.stub().returns(true);
			assert.strictEqual(oChange.isReadOnly(), true);

			//true true
			oChange._isReadOnlyDueToLayer = sinon.stub().returns(true);
			oChange._isReadOnlyWhenNotKeyUser = sinon.stub().returns(true);
			assert.strictEqual(oChange.isReadOnly(), true);
		});

		QUnit.test("_isReadOnlyWhenNotKeyUser shall return true, if not key user", function(assert) {
			var oChange = new Change(this.oChangeDef); //shared change

			sandbox.stub(Settings, "getInstanceOrUndef").returns(new Settings({isKeyUser: false}));
			assert.strictEqual(oChange._isReadOnlyWhenNotKeyUser(), true);
		});

		QUnit.test("_isReadOnlyWhenNotKeyUser shall return false if key user", function(assert) {
			var oChange = new Change(this.oChangeDef); //shared change

			sandbox.stub(Settings, "getInstanceOrUndef").returns(new Settings({isKeyUser: true}));
			assert.strictEqual(oChange._isReadOnlyWhenNotKeyUser(), false);
		});

		QUnit.test("_isReadOnlyWhenNotKeyUser shall return false if not key user but user dependent", function(assert) {
			var oChange = new Change(this.oChangeDef); //shared change

			//make change user dependent. In this case the method should never return true
			sandbox.stub(oChange, 'isUserDependent').returns(true);

			sandbox.stub(Settings, "getInstanceOrUndef").returns(new Settings({isKeyUser: false}));
			assert.strictEqual(oChange._isReadOnlyWhenNotKeyUser(), false);
		});

		QUnit.test("_isReadOnlyWhenNotKeyUser shall return false if key user and user dependent", function(assert) {
			var oChange = new Change(this.oChangeDef); //shared change

			//make change user dependent. In this case the method should never return true
			sandbox.stub(oChange, 'isUserDependent').returns(true);

			sandbox.stub(Settings, "getInstanceOrUndef").returns(new Settings({isKeyUser: true}));
			assert.strictEqual(oChange._isReadOnlyWhenNotKeyUser(), false);
		});

		QUnit.test("_isReadOnlyWhenNotKeyUser shall return true if the user id cannot be determined", function(assert) {
			var oChange = new Change(this.oChangeDef); //shared change

			//make change user dependent. In this case the method should never return true
			sandbox.stub(oChange, 'isUserDependent').returns(false);
			sandbox.stub(Settings, "getInstanceOrUndef").returns(new Settings({isKeyUser: false}));

			assert.strictEqual(oChange._isReadOnlyWhenNotKeyUser(), true);
		});

		QUnit.test("addDependentControl raises error when alias already exists", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			assert.throws(function() {
				oInstance.addDependentControl("someId", "source", {modifier: {}});
			}, new Error("Alias " + "'source'" + " already exists in the change."), "an error was thrown");
		});

		QUnit.test("Operations add and get dependent control work with existing dependent controls in the change", function(assert) {
			var oInstance = new Change(this.oChangeDef);
			var sControlId = "control1Id";
			var oControl = new Control("control2Id");
			var aControl = [
				new Control("control3Id"),
				new Control("control4Id"),
				new Control("control5Id")
			];
			var aControlId = ["control6Id", "control7Id", "undefined", "control1Id"]; //Control 1 duplicate. Should not be included.
			var sId;

			var oJsControlTreeModifierGetSelectorStub = sandbox.stub(JsControlTreeModifier, "getSelector");
			oJsControlTreeModifierGetSelectorStub.onCall(0).returns({
				id: "control1",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(1).returns({
				id: "control2",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(2).returns({
				id: "control3",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(3).returns({
				id: "control4",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(4).returns({
				id: "control5",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(5).returns({
				id: "control6",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(6).returns({
				id: "control7",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(7).returns({});

			oJsControlTreeModifierGetSelectorStub.onCall(8).returns({
				id: "control1",
				idIsLocal: true
			});

			var oReturnedControl = new Control("control1Id");
			var oJsControlTreeModifierBySelectorStub = sandbox.stub(JsControlTreeModifier, "bySelector");
			oJsControlTreeModifierBySelectorStub.onCall(0).returns(oReturnedControl);

			oJsControlTreeModifierBySelectorStub.returns({});

			oInstance.addDependentControl(sControlId, "element", {modifier: JsControlTreeModifier});
			oInstance.addDependentControl(oControl, "anotherSource", {modifier: JsControlTreeModifier});
			oInstance.addDependentControl(aControl, "anotherTarget", {modifier: JsControlTreeModifier});
			oInstance.addDependentControl(aControlId, "anotherTargetWithId", {modifier: JsControlTreeModifier});

			var oDependentControl = oInstance.getDependentControl("source", {modifier: JsControlTreeModifier}, {});
			sId = oDependentControl.getId();
			assert.equal(sId, "control1Id");

			var aDependentControl = oInstance.getDependentControl("anotherTarget", {modifier: JsControlTreeModifier}, {});
			assert.equal(aDependentControl.length, aControl.length);

			var oAppComponent = {
				createId: function (sId) {return sId + "---local";}
			};
			var aDependentIdList = oInstance.getDependentSelectorList(oAppComponent);
			assert.equal(aDependentIdList.length, 10);
			aDependentIdList = oInstance.getDependentControlSelectorList(oAppComponent);
			assert.equal(aDependentIdList.length, 9);
		});

		QUnit.test("Operations add and get dependent control do not break when working with old changes (without dependentSelector)", function(assert) {
			var oChange = jQuery.extend({}, this.oChangeDef);
			delete oChange.dependentSelector;
			var oInstance = new Change(oChange);
			var sControlId = "control1IdB";
			var oControl = new Control("control2IdB");
			var aControl = [
				new Control("control3IdB"),
				new Control("control4IdB"),
				new Control("control5IdB")
			];
			var aControlId = ["control6IdB", "undefined", "control7IdB"];
			var sId;

			var oJsControlTreeModifierGetSelectorStub = sandbox.stub(JsControlTreeModifier, "getSelector");
			oJsControlTreeModifierGetSelectorStub.onCall(0).returns({
				id: "control1",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(1).returns({
				id: "control2",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(2).returns({
				id: "control3",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(3).returns({
				id: "control4",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(4).returns({
				id: "control5",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(5).returns({
				id: "control6",
				idIsLocal: true
			});

			oJsControlTreeModifierGetSelectorStub.onCall(6).returns({});

			oJsControlTreeModifierGetSelectorStub.onCall(7).returns({
				id: "control7",
				idIsLocal: true
			});

			var oReturnedControl = new Control("control1IdB");
			var oJsControlTreeModifierBySelectorStub = sandbox.stub(JsControlTreeModifier, "bySelector");
			oJsControlTreeModifierBySelectorStub.onCall(0).returns(oReturnedControl);

			oJsControlTreeModifierBySelectorStub.returns({});

			var oDependentControl = oInstance.getDependentControl("source", {modifier: JsControlTreeModifier}, {});
			assert.equal(oDependentControl, undefined);

			var aDependentIdList = oInstance.getDependentSelectorList({});
			assert.equal(aDependentIdList.length, 1);
			aDependentIdList = oInstance.getDependentControlSelectorList({});
			assert.equal(aDependentIdList.length, 0);

			oInstance.addDependentControl(sControlId, "element", {modifier: JsControlTreeModifier});
			oInstance.addDependentControl(oControl, "anotherSource", {modifier: JsControlTreeModifier});
			oInstance.addDependentControl(aControl, "anotherTarget", {modifier: JsControlTreeModifier});
			oInstance.addDependentControl(aControlId, "anotherTargetWithId", {modifier: JsControlTreeModifier});

			oDependentControl = oInstance.getDependentControl("source", {modifier: JsControlTreeModifier}, {});
			sId = oDependentControl.getId();
			assert.equal(sId, "control1IdB");

			var aDependentControl = oInstance.getDependentControl("anotherTarget", {modifier: JsControlTreeModifier}, {});
			assert.equal(aDependentControl.length, aControl.length);

			var oAppComponent = {
				createId: function (sId) {return sId + "---local";}
			};
			aDependentIdList = oInstance.getDependentSelectorList(oAppComponent);
			assert.equal(aDependentIdList.length, 8);
			aDependentIdList = oInstance.getDependentControlSelectorList(oAppComponent);
			assert.equal(aDependentIdList.length, 7);
		});
	});

	QUnit.done(function() {
		jQuery("#qunit-fixture").hide();
	});
});