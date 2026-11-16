package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&SabyrContract{})
	if err != nil {
		log.Panicf("не удалось создать чейнкод sabyr: %v", err)
	}
	if err := cc.Start(); err != nil {
		log.Panicf("не удалось запустить чейнкод sabyr: %v", err)
	}
}
