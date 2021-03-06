angular.module('starter', ['ionic', 'ngCordova'])

//le .run est lancé dès le lancement de l'application et permet d'initialiser les services
.run(function($ionicPlatform, GoogleMaps) {
  $ionicPlatform.ready(function() {
    if(window.cordova && window.cordova.plugins.Keyboard) {
      // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
      // for form inputs)
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
      // Don't remove this line unless you know what you are doing. It stops the viewport
      // from snapping when text inputs are focused. Ionic handles this internally for
      // a much nicer keyboard experience.
      cordova.plugins.Keyboard.disableScroll(true);
    }
    if(window.StatusBar) {
      StatusBar.styleDefault();
    }
    GoogleMaps.init("AIzaSyC2OxsNntHPrwjeTlufG9qroEu_pzMNx9I");
  });
})

//Défini le template utilisé dans l'application avec comme route /
.config(function($stateProvider, $urlRouterProvider) {
 
  $stateProvider
  .state('map', {
    url: '/',
    templateUrl: 'templates/map.html',
    controller: 'MapCtrl'
  });
 
  $urlRouterProvider.otherwise("/");
 
})

.config(function($httpProvider) {
    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;
})

//Permets de récupérer les markers présent en base
.factory('Markers', function($cordovaGeolocation, $http) {

  var markers = [];
  var options = {timeout: 10000, enableHighAccuracy: true};
  var lat;
  var lgt;
  
        return {
          getMarkers: function(latLng){
             lat = latLng.lat();
             lgt = latLng.lng();
            return $http.get('http://localhost/markers.php?lat='+lat+'&lng='+lgt+'&distance=1').then(function(response){
                markers = response;
                return markers;
            });

          }
         
        }
         
})

.factory('GoogleMaps', function($cordovaGeolocation, $ionicLoading, 
$rootScope, $cordovaNetwork, Markers, $ionicPopup, $interval, $http, ConnectivityMonitor){
    
    //On initialise l'apiKey à faux
    var apiKey = false;
    //var map correspond à la carte
    var map;
    //var markesList correspond aux marqueurs récupérés en base
    var markersList = [];
    
    var markerCache = [];

    function initMap(){

        var options = {timeout: 10000, enableHighAccuracy: true};
        
        //On déclare la création de la carte avec un zoom à 25
	map = new google.maps.Map(document.getElementById('map'), {   
                                    zoom: 25,
                                    mapTypeId: google.maps.MapTypeId.ROADMAP,
				    disableDefaultUI: true
                                });	          
        
        //On déclare le marker de la position de l'utilisateur
        var markerHere = new google.maps.Marker({
                                                map: map,
                                                animation: null,
                                                icon: 'http://localhost/icon/here.png',
                                                });
        
        //On affiche un message si l'utilisateur clique sur sa position
        var infoWindow = new google.maps.InfoWindow({
                                                content: "Vous êtes ici"
                                                });
                                                
        google.maps.event.addListener(markerHere, 'click', function () {
                                infoWindow.open(map, markerHere);
                                });
                                        
        //On déclare le service permettant de créer les itinéraires
        var directionsService = new google.maps.DirectionsService;
	var directionsDisplay = new google.maps.DirectionsRenderer;
	
	//On attend que la carte soit chargée pour initialiser les POI
        google.maps.event.addListenerOnce(map, 'idle', function(){
       			callAtInterval();
      		});
                
        enableMap();

	function callAtInterval() {

	    $cordovaGeolocation.getCurrentPosition(options).then(function(position){
		
                //On récupère la position actuelle
		var latLng = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);  

                //On centre la carte sur la position actuelle
		map.setCenter(latLng);
		directionsDisplay.setMap(map);
                //On change la position de l'utilisateur à chaque passage dans la boucle
                markerHere.setPosition(latLng);                                        
                //Si l'utilisateur à renseigné un itinéraire alors on l'affiche
	  	if(document.getElementById('end').value){
                    calculateAndDisplayRoute(directionsService, directionsDisplay, latLng);
		}                
		var onChangeHandler = function() {
                    calculateAndDisplayRoute(directionsService, directionsDisplay, latLng);
		};

		document.getElementById('end').addEventListener('change', onChangeHandler);
	     	var iconBase = 'https://maps.google.com/mapfiles/kml/shapes/';
	     		        
                //On charge les marqueurs à proximité de l'utilisateur
       		loadMarkers(latLng);	
            });
        }
	$interval( function(){ callAtInterval(); }, 5000);   
    }
    
    //Permet de cacher le loading
    function enableMap(){
        $ionicLoading.hide();
    }
    
    //Message affiché lorsque l'utilisateur n'est plus connecté
    function disableMap(){
        $ionicLoading.show({
            template: "Vous devez être connecté pour utiliser l'application"
        });
    }
  
    //Fonction permettant d'afficher un message en attendant que la carte se charge
    function loadGoogleMaps(){
 
        $ionicLoading.show({
            template: 'Chargement de la carte'
        });

        //Cette fonction sera appelée lorsque le SDK sera chargé
        window.mapInit = function(){
            initMap();
        };  

        //Créer un element afin de l'insérer dans la page
        var script = document.createElement("script");
        script.type = "text/javascript";
        script.id = "googleMaps";

        if(apiKey){
            script.src = 'http://maps.google.com/maps/api/js?key=' + apiKey 
            + '&libraries=places,geometry&callback=mapInit';
        }
        else {
            script.src = 'http://maps.google.com/maps/api/js?sensor=true&callback=mapInit';
        }
        document.body.appendChild(script);
    }
 
    function checkLoaded(){
        if(typeof google == "undefined" || typeof google.maps == "undefined"){
            loadGoogleMaps();
        } 
        else {
            enableMap();
        }       
    }
    
    //Fonction permettant de charger tous les markers à proximité de l'utilisateur et de les afficher sur la map
    function loadMarkers(latLng){
	//On vide le cache de markers       
        function setMapOnAll(map) {
                    for (var i = 0; i < markersList.length; i++) {
	   		markersList[i].setMap(map);
                    }
		}
                
	setMapOnAll(null);
	markersList = [];
        
        //Récupère tous les markers à proximité
        Markers.getMarkers(latLng).then(function(markers){
            
            var records = markers.data.markers;
            //Pour chaque résultat retourné
            for (var i = 0; i < records.length; i++) { 
                //On traduit la lat et lng récupéré en position LatLng
                var markerPos = new google.maps.LatLng(records[i].lat, records[i].lng);
                // On ajoute les markers à la carte
                
                var marker = new google.maps.Marker({
                    map: map,
                    animation: null,
                    position: markerPos,
                    icon: records[i].icon,
                    distance: parseFloat(records[i].dist)*1000,
                    nom: records[i].name,
                    id: records[i].id
                });               

              markersList.push(marker);
                               
                //On ajoute une écoute sur le click des markers
                google.maps.event.addListener(markersList[i], 'click', function (event) {
                    actionClickMarker(this.distance, this.nom, this.id);
                });
  	  
            }

        }); 
    }
    
    /**
     * Fonction permettant de créer un ionicPopup à chaque clic sur un marker avec les infos de celui ci
     * @param {type} distM
     * @param {type} nom
     * @param {type} id
     * @returns {undefined}
     */
    function actionClickMarker(distM, nom, id){
            	
        var distance = Math.floor( distM );
        var myPopup = $ionicPopup.show({
            template: ""+nom+" à "+distance+" m",
            title: "Evenement",    
            buttons: 
            [
                { 
                    text: 'Plus là',
                    onTap: function(e) {
                    $http.post("api/popUpdate.php",'{"id":'+id+'}')
                    .success(function(data, status, headers, config){
                        myPopup.close();
                    });       
                    }
                }, 
                {
                    text: '<b>Encore là</b>',
                    type: 'button-positive',
                    onTap: function(e) {
                        myPopup.close();        
                    }
                }
            ]
            });
    }
    //Fonction écoutant le statut de connexion de l'utilisateur
    function addConnectivityListeners(){
        if(ionic.Platform.isWebView()){
            // Regarde si la map est déjà chargée quand l'utilisateur redeviens en ligne
            $rootScope.$on('$cordovaNetwork:online', function(event, networkState){
              checkLoaded();
            });
            // Désactive la carte si l'utilisateur est hors ligne
            $rootScope.$on('$cordovaNetwork:offline', function(event, networkState){
              disableMap();
            });
        }
        else {
          //Regarde si la map est déjà chargée quand l'utilisateur redeviens en ligne
          window.addEventListener("online", function(e) {
            checkLoaded();
          }, false);    
          //Désactive la carte si l'utilisateur est hors ligne
          window.addEventListener("offline", function(e) {
            disableMap();
          }, false);  
        }
    }  
    return {
        init: function(key){
            //On regarde si l'APIkey est définie
            if(typeof key != "undefined"){
                apiKey = key;
            }
            //Si le type de google est "undefined"
            if(typeof google == "undefined" || typeof google.maps == "undefined"){
                //On masque la carte
                disableMap();
                //Si l'utilisateur est en ligne, on recharge le service google maps sans apiKey
                if(ConnectivityMonitor.isOnline()){
                    loadGoogleMaps();
                }
            }
            else {
                //Sinon on recharge la carte
                if(ConnectivityMonitor.isOnline()){
                    initMap();
                    enableMap();
                } else {
                    disableMap();
                }
            }
            addConnectivityListeners();
        }
    }
})

/**
 * Factory permettant de gérer l'état de connexion de l'utilisateur
 * @returns {Boolean}
 */
.factory('ConnectivityMonitor', function($rootScope, $cordovaNetwork){
 
    return {
        //retourne le comportement lorsque l'utilisateur est en ligne
        isOnline: function(){
          if(ionic.Platform.isWebView()){
            return $cordovaNetwork.isOnline();    
          } else {
            return navigator.onLine;
          }
        },
        //retourne le comportement lorsque l'utilisateur est hors ligne
        ifOffline: function(){
          if(ionic.Platform.isWebView()){
            return !$cordovaNetwork.isOnline();    
          } else {
            return !navigator.onLine;
          }
        }
    }
})

/*
 * Controller permettant d'enregistrer les alertes et de gérer le menu déroulant
 */
.controller('MapCtrl', function($scope, $state, $cordovaGeolocation, $ionicPopover, $http) {

    //Sauvegarder les coordonnées signalées par l'utilisateur en base
    $scope.saveDetails = function(a){
        var options = {timeout: 10000, enableHighAccuracy: true};
        //On recherche la position où le marker à été émis
        $cordovaGeolocation.getCurrentPosition(options).then(function(position){
            var lat = position.coords.latitude;
            var lgt = position.coords.longitude;
            //On envoi les données au serveur afin qu'il enregistre en base
            $http.post("api/saveDetails.php",'{"lat":'+lat+', "lgt" :'+lgt+', "type" :"'+a+'"}')
            .success(function(data, status, headers, config){
            });
        });
    }
    
    //Gestion de la partie speech
    this.rec = new webkitSpeechRecognition();
    this.final = '';
    var self = this;
  
    this.rec.continuous = false;
    this.rec.lang = 'FR-fr';
    this.rec.interimResults = true;
    this.rec.onerror = function(event) {
        console.log('error!');
    };

    $scope.start = function() {
        self.rec.start();
    };
  
    this.rec.onresult = function(event) {
        for(var i = event.resultIndex; i < event.results.length; i++) {
            //Si l'utilisateur a terminé de parler
            if(event.results[i].isFinal) {
                //On concatène les résultats
                self.final = self.final.concat(event.results[i][0].transcript);
                var commande = event.results[i][0].transcript;
                //Pour chaque type d'alerte on va l'enregistrer
                if(commande == "accident"){
                    $scope.saveDetails('accident');
                } 
                else if (commande == "bouchon"){
                    $scope.saveDetails('bouchon');
                }
                else if (commande == "radar"){
                    $scope.saveDetails("radar");
                }
                else if (commande == "police"){
                    $scope.saveDetails('police');
                }
                else if (commande == "danger"){
                    $scope.saveDetails('danger');
                }
                else {
                    $scope.final = commande;
                } 
            } 
            //Sinon on prend ça comme une addresse
            else {
                $scope.final = event.results[i][0].transcript;
            }
        }
    };
  
    //ionicPopover correspond au menu déroulant contenant les alertes à signaler
    $ionicPopover.fromTemplateUrl('templates/popover.html', {
        scope: $scope,
    }).then(function(popover) {
        $scope.popover = popover;
    });										
})
