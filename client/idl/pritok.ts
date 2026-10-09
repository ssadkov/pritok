/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/pritok.json`.
 */
export type Pritok = {
  "address": "9LMSMqD3xMBaNdfRb4bKDT3MBTX8ry1Na84rMSJ787aY",
  "metadata": {
    "name": "pritok",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "PRITOK: corporate actions for tokenized bonds"
  },
  "instructions": [
    {
      "name": "allowHolder",
      "discriminator": [
        176,
        1,
        245,
        90,
        146,
        217,
        110,
        85
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bond"
        },
        {
          "name": "owner"
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claim",
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "writable": true
        },
        {
          "name": "holder",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "claim",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "ownerPayment",
          "writable": true
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "actionId",
          "type": "u8"
        }
      ]
    },
    {
      "name": "claimToBank",
      "discriminator": [
        28,
        162,
        208,
        80,
        71,
        228,
        33,
        192
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The holder, or the registrar acting for the holder."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "owner"
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bond",
          "writable": true
        },
        {
          "name": "holder",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "claim",
          "docs": [
            "Same seeds as a wallet claim: a payout goes either to the wallet or to the bank, once."
          ],
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "agentPayment",
          "docs": [
            "Paying agent's account: the registrar's associated account for the payment token."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "config.operator",
                "account": "config"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "actionId",
          "type": "u8"
        }
      ]
    },
    {
      "name": "closeSubscription",
      "discriminator": [
        33,
        214,
        169,
        135,
        35,
        127,
        78,
        7
      ],
      "accounts": [
        {
          "name": "bond",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "confirmBankPayment",
      "discriminator": [
        118,
        46,
        68,
        50,
        22,
        55,
        210,
        159
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bond"
        },
        {
          "name": "owner"
        },
        {
          "name": "claim",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "actionId",
          "type": "u8"
        },
        {
          "name": "bankRefHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "createBond",
      "discriminator": [
        96,
        81,
        70,
        166,
        111,
        33,
        61,
        50
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bond",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  111,
                  110,
                  100
                ]
              },
              {
                "kind": "account",
                "path": "issuer"
              },
              {
                "kind": "arg",
                "path": "params.bond_id"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              }
            ]
          }
        },
        {
          "name": "paymentMint"
        },
        {
          "name": "vault",
          "docs": [
            "Payment vault: holds funded, not yet claimed obligations; only the program moves money out."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "bondTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "params",
          "type": {
            "defined": {
              "name": "createBondParams"
            }
          }
        }
      ]
    },
    {
      "name": "declarePartialRedemption",
      "discriminator": [
        78,
        141,
        47,
        47,
        67,
        144,
        179,
        209
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "bond",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "issuerPayment",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentTokenProgram"
        }
      ],
      "args": [
        {
          "name": "couponActionId",
          "type": "u8"
        },
        {
          "name": "redeemBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "fundAction",
      "discriminator": [
        254,
        42,
        57,
        244,
        127,
        99,
        74,
        178
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "bond",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "issuerPayment",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentTokenProgram"
        }
      ],
      "args": [
        {
          "name": "actionId",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initConfig",
      "discriminator": [
        23,
        235,
        115,
        232,
        168,
        96,
        1,
        231
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "paymentMints",
          "type": {
            "vec": "pubkey"
          }
        }
      ]
    },
    {
      "name": "markDefault",
      "discriminator": [
        182,
        231,
        123,
        132,
        66,
        208,
        137,
        139
      ],
      "accounts": [
        {
          "name": "bond",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "actionId",
          "type": "u8"
        }
      ]
    },
    {
      "name": "payHolder",
      "discriminator": [
        200,
        10,
        93,
        192,
        80,
        148,
        8,
        75
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "bond",
          "writable": true
        },
        {
          "name": "holder",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "claim",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "ownerPayment",
          "docs": [
            "The holder's own associated account for the payment token: the only place the money can go."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "actionId",
          "type": "u8"
        }
      ]
    },
    {
      "name": "redeem",
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "bond",
          "writable": true
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "maturityClaim",
          "writable": true
        },
        {
          "name": "couponClaim",
          "docs": [
            "otherwise left untouched so the coupon can still be claimed later."
          ],
          "writable": true
        },
        {
          "name": "bondMint",
          "writable": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "ownerBondAta",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "ownerPayment",
          "writable": true
        },
        {
          "name": "bondTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maturityActionId",
          "type": "u8"
        },
        {
          "name": "couponActionId",
          "type": "u8"
        }
      ]
    },
    {
      "name": "redeemFor",
      "discriminator": [
        98,
        224,
        121,
        78,
        193,
        242,
        79,
        135
      ],
      "accounts": [
        {
          "name": "operator",
          "writable": true,
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "bond",
          "writable": true
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "maturityClaim",
          "writable": true
        },
        {
          "name": "couponClaim",
          "writable": true
        },
        {
          "name": "bondMint",
          "writable": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "ownerBondAta",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "ownerPayment",
          "docs": [
            "The holder's own associated account for the payment token."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "bondTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "maturityActionId",
          "type": "u8"
        },
        {
          "name": "couponActionId",
          "type": "u8"
        }
      ]
    },
    {
      "name": "revokeHolder",
      "discriminator": [
        250,
        238,
        38,
        18,
        138,
        55,
        227,
        111
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "holder",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "setPaused",
      "discriminator": [
        91,
        60,
        125,
        192,
        176,
        225,
        166,
        218
      ],
      "accounts": [
        {
          "name": "operator",
          "signer": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "subscribe",
      "discriminator": [
        254,
        28,
        191,
        138,
        156,
        179,
        183,
        53
      ],
      "accounts": [
        {
          "name": "investor",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bond",
          "writable": true
        },
        {
          "name": "issuer",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "holder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "investor"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "writable": true,
          "relations": [
            "bond"
          ]
        },
        {
          "name": "investorBondAta",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "investorPayment",
          "writable": true
        },
        {
          "name": "issuerPayment",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "issuer"
              },
              {
                "kind": "account",
                "path": "paymentTokenProgram"
              },
              {
                "kind": "account",
                "path": "paymentMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "bondTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "units",
          "type": "u64"
        }
      ]
    },
    {
      "name": "tradeDvp",
      "discriminator": [
        30,
        145,
        134,
        229,
        248,
        21,
        170,
        83
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bond"
        },
        {
          "name": "sellerHolder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "seller"
              }
            ]
          }
        },
        {
          "name": "buyerHolder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "buyer"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "sellerBondAta",
          "writable": true
        },
        {
          "name": "buyerBondAta",
          "writable": true
        },
        {
          "name": "paymentMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "buyerPayment",
          "writable": true
        },
        {
          "name": "sellerPayment",
          "writable": true
        },
        {
          "name": "bondTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "paymentTokenProgram"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "units",
          "type": "u64"
        },
        {
          "name": "cleanPriceBps",
          "type": "u16"
        },
        {
          "name": "maxTotal",
          "type": "u64"
        }
      ]
    },
    {
      "name": "transferBond",
      "discriminator": [
        0,
        46,
        163,
        201,
        117,
        252,
        130,
        26
      ],
      "accounts": [
        {
          "name": "from",
          "writable": true,
          "signer": true
        },
        {
          "name": "to"
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "bond"
        },
        {
          "name": "fromHolder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "from"
              }
            ]
          }
        },
        {
          "name": "toHolder",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  104,
                  111,
                  108,
                  100,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "bond"
              },
              {
                "kind": "account",
                "path": "to"
              }
            ]
          }
        },
        {
          "name": "bondMint",
          "relations": [
            "bond"
          ]
        },
        {
          "name": "fromAta",
          "writable": true
        },
        {
          "name": "toAta",
          "writable": true
        },
        {
          "name": "bondTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "units",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bond",
      "discriminator": [
        224,
        128,
        48,
        251,
        182,
        246,
        111,
        196
      ]
    },
    {
      "name": "claim",
      "discriminator": [
        155,
        70,
        22,
        176,
        123,
        215,
        246,
        102
      ]
    },
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "holder",
      "discriminator": [
        37,
        121,
        1,
        40,
        55,
        46,
        199,
        157
      ]
    }
  ],
  "events": [
    {
      "name": "tradeSettled",
      "discriminator": [
        22,
        119,
        166,
        225,
        175,
        53,
        93,
        216
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "notOperator",
      "msg": "Signer is not the operator"
    },
    {
      "code": 6001,
      "name": "tooManyPaymentMints",
      "msg": "Too many payment mints"
    },
    {
      "code": 6002,
      "name": "paymentMintNotAllowed",
      "msg": "Payment mint is not on the operator's allowlist"
    },
    {
      "code": 6003,
      "name": "paymentMintExtensionNotAllowed",
      "msg": "Payment mint has an extension that changes transfer amounts or routing"
    },
    {
      "code": 6004,
      "name": "invalidBondParams",
      "msg": "Invalid bond parameters"
    },
    {
      "code": 6005,
      "name": "holderNotAllowed",
      "msg": "Holder is not allowed"
    },
    {
      "code": 6006,
      "name": "paused",
      "msg": "Operations are paused"
    },
    {
      "code": 6007,
      "name": "subscriptionClosed",
      "msg": "Subscription is closed"
    },
    {
      "code": 6008,
      "name": "subscriptionOpen",
      "msg": "Subscription is still open"
    },
    {
      "code": 6009,
      "name": "transfersClosed",
      "msg": "Transfers are closed after the maturity record date"
    },
    {
      "code": 6010,
      "name": "zeroAmount",
      "msg": "Amount must be positive"
    },
    {
      "code": 6011,
      "name": "insufficientBalance",
      "msg": "Insufficient bond balance"
    },
    {
      "code": 6012,
      "name": "notCanonicalAta",
      "msg": "Token account is not the holder's canonical associated token account"
    },
    {
      "code": 6013,
      "name": "selfTransfer",
      "msg": "Cannot transfer to self"
    },
    {
      "code": 6014,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6015,
      "name": "unknownAction",
      "msg": "Unknown action"
    },
    {
      "code": 6016,
      "name": "wrongActionKind",
      "msg": "Wrong action kind for this instruction"
    },
    {
      "code": 6017,
      "name": "bankSettlement",
      "msg": "Action is settled through the bank path"
    },
    {
      "code": 6018,
      "name": "overFunding",
      "msg": "Funding exceeds the amount required"
    },
    {
      "code": 6019,
      "name": "notPayable",
      "msg": "Payment date has not arrived"
    },
    {
      "code": 6020,
      "name": "notFunded",
      "msg": "Action is not fully funded"
    },
    {
      "code": 6021,
      "name": "cannotDefault",
      "msg": "Action cannot be marked as defaulted"
    },
    {
      "code": 6022,
      "name": "nothingToPay",
      "msg": "Nothing to pay"
    },
    {
      "code": 6023,
      "name": "vaultBelowReserve",
      "msg": "Payment vault holds less than reserved obligations"
    },
    {
      "code": 6024,
      "name": "recordDatePassed",
      "msg": "Record date has already passed"
    },
    {
      "code": 6025,
      "name": "tooManyEvents",
      "msg": "Event limit reached"
    },
    {
      "code": 6026,
      "name": "invalidRedemption",
      "msg": "Invalid redemption share"
    },
    {
      "code": 6027,
      "name": "notHolderOrOperator",
      "msg": "Only the holder or the registrar can request a bank payout"
    },
    {
      "code": 6028,
      "name": "notBankRequest",
      "msg": "Payout is not awaiting bank confirmation"
    },
    {
      "code": 6029,
      "name": "emptyBankRef",
      "msg": "Bank payment reference is empty"
    },
    {
      "code": 6030,
      "name": "invalidPrice",
      "msg": "Price must be positive"
    },
    {
      "code": 6031,
      "name": "priceAboveLimit",
      "msg": "Total price exceeds the buyer's limit"
    },
    {
      "code": 6032,
      "name": "operatorRedemptionUnavailable",
      "msg": "This issue was created without operator redemption"
    }
  ],
  "types": [
    {
      "name": "bond",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "bondId",
            "type": "u64"
          },
          {
            "name": "bondMint",
            "type": "pubkey"
          },
          {
            "name": "paymentMint",
            "type": "pubkey"
          },
          {
            "name": "faceValue",
            "type": "u64"
          },
          {
            "name": "couponBps",
            "type": "u16"
          },
          {
            "name": "periodSecs",
            "type": "i64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "recordOffsetSecs",
            "type": "i64"
          },
          {
            "name": "numPeriods",
            "type": "u8"
          },
          {
            "name": "factorBps",
            "docs": [
              "Face-value factor after all declared partial redemptions (10 000 = 100%).",
              "Each event carries the factor it is calculated from in `factor_bps_applied`."
            ],
            "type": "u16"
          },
          {
            "name": "subscriptionEndTs",
            "type": "i64"
          },
          {
            "name": "subscriptionClosed",
            "type": "bool"
          },
          {
            "name": "issuedUnits",
            "docs": [
              "Bonds outstanding at every record date; fixed when subscription closes."
            ],
            "type": "u64"
          },
          {
            "name": "supply",
            "docs": [
              "Bonds not yet burned."
            ],
            "type": "u64"
          },
          {
            "name": "reserved",
            "docs": [
              "Funded and not yet claimed onchain obligations held in the payment vault."
            ],
            "type": "u64"
          },
          {
            "name": "events",
            "docs": [
              "Sorted by `record_ts` (ties keep insertion order)."
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "event"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "eventsLen",
            "type": "u8"
          },
          {
            "name": "nextActionId",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "mintBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "claim",
      "docs": [
        "Receipt for one holder's payout on one event; its existence prevents double payment."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "actionId",
            "type": "u8"
          },
          {
            "name": "units",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "bankRefHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "config",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "operator",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "paymentMints",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "paymentMintsLen",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "createBondParams",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bondId",
            "type": "u64"
          },
          {
            "name": "faceValue",
            "type": "u64"
          },
          {
            "name": "couponBps",
            "type": "u16"
          },
          {
            "name": "periodSecs",
            "type": "i64"
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "recordOffsetSecs",
            "type": "i64"
          },
          {
            "name": "numPeriods",
            "type": "u8"
          },
          {
            "name": "subscriptionEndTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "event",
      "docs": [
        "One corporate-action event. `action_id` is a stable name (used in claim PDAs);",
        "the event's index in `Bond::events` is its chronological position."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "actionId",
            "type": "u8"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "recordTs",
            "type": "i64"
          },
          {
            "name": "payTs",
            "type": "i64"
          },
          {
            "name": "factorBpsApplied",
            "docs": [
              "Face-value factor this event is calculated from (10 000 = 100%)."
            ],
            "type": "u16"
          },
          {
            "name": "amountPerUnit",
            "type": "u64"
          },
          {
            "name": "funded",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "u64"
          },
          {
            "name": "mode",
            "type": "u8"
          },
          {
            "name": "status",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "holder",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "allowed",
            "type": "bool"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "syncedUpto",
            "docs": [
              "Number of leading events whose record-date balance is frozen in `bal_at`."
            ],
            "type": "u8"
          },
          {
            "name": "balAt",
            "docs": [
              "Balance at the record date of the event at the same chronological position."
            ],
            "type": {
              "array": [
                "u64",
                8
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "tradeSettled",
      "docs": [
        "Settlement record in the transaction log: price, accrued interest and total."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bond",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "units",
            "type": "u64"
          },
          {
            "name": "cleanPriceBps",
            "type": "u16"
          },
          {
            "name": "cleanPerUnit",
            "type": "u64"
          },
          {
            "name": "accruedPerUnit",
            "type": "u64"
          },
          {
            "name": "total",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
