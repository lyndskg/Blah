const { Builder, By, Key, until } = require("selenium-webdriver");
const { sleep } = require("./sleep");
require('dotenv').config()
const { captchaCheck } = require("./captchaCheck");

let driver = await new Builder().forBrowser("chrome").build();

let refreshButton = null;

document.body.onload = addSliderValue("sliders--action", "settings--actions__number", "Seconds");
document.body.onload = addSliderValue("sliders--hours", "settings--hour__number", "Hours");

function addSliderValue(inputElement, outputElement, outputType) {
    let inputSlider = document.querySelector(`.${inputElement}`);
    let outputSliderValue = document.querySelector(`.${outputElement}`);

    outputSliderValue.innerHTML = inputSlider.value + " " + outputType;

    inputSlider.oninput = function() {
        outputSliderValue.innerHTML = this.value + " " + outputType;

        if (inputElement == "sliders--action") {
            tokens.actionRefreshRate = this.value;
        } else {
            tokens.refreshRateAllInMinutes = this.value * 60;
        }   
    }
}

let tokens = {
    accesstoken: await GetAccessToken(),
    userid: await GetUserId(),
    actionRefreshRate: null,
    refreshRateAllInMinutes: null,
    numberOfListings: null,
    timeUntilNextRefresh: null,
    itemsRefreshed: 0,
    interval: null,
    stopRefresh: false
}

async function GetAccessToken() {
    try {
        let accessToken = await chrome.cookies.get({
            url: "https://www.poshmark.com",
            name: "access_token"
        });

        return accessToken.value;
    } catch {
        console.log("This is what happens.");
    }
}

async function GetUserId() {
    let userId = await chrome.cookies.get({
        url: "https://www.poshmark.com",
        name: "user_id"
    });

    return userId.value;
} 

document.body.onload = OnLoad();

function OnLoad() {
    refreshButton = document.querySelector(".refresh__button--button");
    refreshButton.addEventListener("click", refreshClick);
    tokens.actionRefreshRate = document.querySelector(".sliders--action").value;
    tokens.refreshRateAllInMinutes = document.querySelector(".sliders--hours").value * 60;
}

async function refreshClick() {
    if (refreshButton.innerHTML == "Refresh") {
      tokens.stopRefresh = false;
      refreshButton.innerHTML = "Refreshing...";

      await RefreshAllListings();
    } else if (refreshButton.innerHTML == "Refreshing...") {
      refreshButton.innerHTML = "Refresh";
      tokens.stopRefresh = true;

      RemovePicture();
    } else {
      tokens.interval = clearInterval();

      let numberOfItems = document.createElement("p");

      numberOfItems.remove();
      refreshButton.innerHTML = "Refresh";
    }
}

async function GetAllListings(accessToken, sort) {
    const options = {
        method: 'GET',
        headers: {Authorization: `Bearer ${accessToken}`}
      };

      let response = null;

      try {
        let result = await fetch(`https://poshmark.com/closet/lyndskgg?availability=available&sort_by=${sort}`, options);
        response = await result.json();
      } catch {
          console.log("https://poshmark.com/closet/lyndskgg?availability=available&sort_by=${sort} failed")
      }

      let bottom = false;
      let scrollNumber = 0;
      let currentHeight = await driver.executeScript(
        "return document.documentElement.scrollHeight"
      );

      while (!bottom) {
        console.log("Scroll # ", scrollNumber);
        let scrollScript = "window.scrollTo(0, document.body.scrollHeight);";
        driver.executeScript(scrollScript);
        await sleep(2500);
        let newHeight = await driver.executeScript(
          "return document.documentElement.scrollHeight"
        );
        if (currentHeight === newHeight) {
          bottom = true;
        } else {
          scrollNumber++;
          currentHeight = newHeight;
        }
      }

    return response;
}

async function GetAllUnsoldSlugs() {
    let unsoldListings = [];
    let response = await GetAllListings(tokens.accesstoken, sort);

    while (true) {
          if (response.products[response.products.length - 1].status != "ONSALE") {
            for (const product of response.products){
                if (product.status == "ONSALE") {
                    unsoldListings.push(product.slug);
                }
            }
            break;
          } else {
              for (const product of response.products){
                unsoldListings.push(product.slug);
              }
              cursor = response.meta.cursor;
              await sleep(1);
          }
    }

    tokens.numberOfListings = unsoldListings.length;

    return unsoldListings;
}

function displayNumberOfUnSoldItems() {
    let refreshButton = document.querySelector(".refresh__button--button");
    let numberOfItems = document.createElement("p");
    numberOfItems.innerHTML = `Items Refreshed: 0/${tokens.numberOfListings}`;
    refreshButton.appendChild(numberOfItems);
}

async function GetListing(slug) {
    const options = {
        method: 'GET',
        headers: {Authorization: `Bearer ${tokens.accesstoken}`}
      };
      let response = null;
      try {
        response = await fetch(`https://poshmark.com/closet/lyndskgg?availability=available&sort_by=${slug}/`, options);
        response = await response.json();
      }
      catch {
        console.log(`https://poshmark.com/closet/lyndskgg?availability=available&sort_by=${slug} Failed`);
      }
    return response;
}

function showPicture(itemPicture) {
    let image;

    try {
      image = document.querySelector("img");
    } catch {
      image = document.createElement("img");
      image.className = "image";
      let imageParent = document.querySelector(".settings--title");
      imageParent.appendChild(image);
    }

    image.src = itemPicture;

    image.style.width = "5rem";
    image.style.height = "5rem";
    image.style.border = "1px solid black";
}

function sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function PutListing(getListingResponse) {
    let pictureIds = [];

    for (const picture of getListingResponse.pictures) {
        pictureIds.push(picture[0].id);
    }
    
    let resultBody = JSON.stringify({"pictureIds": pictureIds,
        "description": getListingResponse.description,
        "group": getListingResponse.group,
        "productType": getListingResponse.productType,
        "attributes": getListingResponse.attributes,
        "gender": getListingResponse.gender,
        "variantSetId": getListingResponse.variantSetId,
        "nationalShippingCost": getListingResponse.price.nationalShippingCost,
        "priceAmount": getListingResponse.price.priceAmount,
        "variants": getListingResponse.variants,
        "shippingMethods": getListingResponse.shippingMethods,
        "priceCurrency": getListingResponse.price.currencyName,
        "address": getListingResponse.address,
        "countryCode": getListingResponse.countryCode,
        "categoryId": getListingResponse.categoryId,
        "brandId": getListingResponse.brandId,
        "isKids": getListingResponse.isKids});

    const options = {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${tokens.accesstoken}`,
          "Content-Type": "application/json"
        },
        body: resultBody,
        redirect: 'follow'
      };
      let response = null;
      try {
        response = await fetch(`https://webapi.depop.com/api/v2/products/${getListingResponse.slug}/`, options);
        return response.status;
      }
      catch {
          response = await response.json();
        return response;
      }
}

function incrementItems() {
    let numberOfItems = document.querySelector("p");
    tokens.itemsRefreshed++;
    numberOfItems.innerHTML = `Items Refreshed: ${tokens.itemsRefreshed}/${tokens.numberOfListings}`;
}

async function MoveSoldListingToBottom() {
    const options = {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
           Authorization: `Bearer ${tokens.accesstoken}`
        },
        body: '{"move_sold_to_end":true,"changeset":[]}'
      };
      let response = null;
      try {
        response = await fetch(`https://webapi.depop.com/api/v1/shop/${tokens.userid}/rearrange`, options)
      }   
      catch(e) {
        console("Exception in Move Sold Listings To Bottom", e);
      }
      if (response.status != 204) {
          console.log("Move Sold Listings to Bottom Failed", response);
      }
}

function RemovePicture(){
    let image = document.querySelector("img");
    image.remove();
}

function interval() {
    let seconds = 60;

    tokens.refreshRateAllInMinutes--;

    tokens.interval = setInterval(function() {
        if (tokens.refreshRateAllInMinutes == 0) {
            RefreshAllListings();
            tokens.refreshRateAllInMinutes = document.querySelector(".sliders--hours").value;
        } else {
            let hours = Math.floor(tokens.refreshRateAllInMinutes/60);
            let minutes = tokens.refreshRateAllInMinutes % 60;
            let numberOfItems = document.querySelector("p");

            seconds--;

            if (seconds == 0) {
                seconds = 60;
                tokens.refreshRateAllInMinutes--;
            }

            numberOfItems.innerHTML = `Time Remaining Until Next Refresh ${hours}:${minutes}:${seconds}`;
        }
    }, 1000);
}

  
async function RefreshAllListings() {
    let slugs = await GetAllUnsoldSlugs();
    displayNumberOfUnSoldItems();

    for (const slug of slugs) {
      
      let individualListing = await GetListing(slug);

      showPicture(individualListing.pictures[0][0].url);
      await sleep(tokens.actionRefreshRate/2);

      await PutListing(individualListing);
      await sleep(tokens.actionRefreshRate/2);

      if (tokens.stopRefresh){
        break;
      }
      incrementItems();
    }

    await MoveSoldListingToBottom();

    if(tokens.stopRefresh == false) {
      RemovePicture();
      interval();
    }
}